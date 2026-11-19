import { adminClient } from '@repo/db/admin'
import { requireAdmin } from '@/lib/auth/require-admin'
import type { AnswerCountClient } from '@/lib/queries/answered-item-counts'
import { fetchAnsweredItemCounts } from '@/lib/queries/answered-item-counts'
import { escapeLike } from '@/lib/utils/escape-like'
import { quoteOrValue } from '@/lib/utils/quote-or-value'
import {
  type OffsetChainBuilder,
  offsetAdminClient,
  runOffsetCount,
  runOffsetPage,
} from './_offset-query'
import { type AttemptRowRaw, mapAttemptRow } from './_row-mappers'
import { clampPage, PAGE_SIZE } from './pagination'
import type { InternalExamAttemptRow, ListAttemptsFilters } from './types'

function applyAttemptFilters(
  builder: OffsetChainBuilder,
  organizationId: string,
  filters: ListAttemptsFilters,
): OffsetChainBuilder {
  let b = builder
    .eq('organization_id', organizationId)
    .eq('mode', 'internal_exam')
    .not('ended_at', 'is', null)
    .is('deleted_at', null)
  if (filters.studentId) b = b.eq('student_id', filters.studentId)
  if (filters.subjectId) b = b.eq('subject_id', filters.subjectId)
  return applyEmbedFilters(b, organizationId, filters)
}

// Search, group and sitting filter through inner embeds (see `attemptSelect`); users are never
// filtered on `deleted_at`, so deactivated students stay listed.
function applyEmbedFilters(
  builder: OffsetChainBuilder,
  organizationId: string,
  filters: ListAttemptsFilters,
): OffsetChainBuilder {
  let b = builder
  if (filters.search) {
    const p = quoteOrValue(`%${escapeLike(filters.search)}%`)
    b = b.or(`full_name.ilike.${p},email.ilike.${p}`, { referencedTable: 'users' })
  }
  if (filters.groupId) {
    b = b
      .eq('users.filter_members.group_id', filters.groupId)
      .eq('users.filter_members.organization_id', organizationId)
      .is('users.filter_members.deleted_at', null)
  }
  if (filters.sittingId) b = b.eq('filter_codes.filter_entry.sitting_id', filters.sittingId)
  return b
}

const GROUP_FILTER_EMBED =
  'filter_members:student_group_members!student_group_members_user_id_fkey!inner(group_id)'
const SITTING_FILTER_EMBED =
  'filter_codes:internal_exam_codes!consumed_session_id!inner(filter_entry:exam_sitting_entries!internal_exam_codes_sitting_entry_fkey!inner(sitting_id))'

const SELECT_COLUMNS = `id, student_id, subject_id, started_at, ended_at, total_questions,
       correct_count, score_percentage, passed,
       easa_subjects!subject_id(name),
       USERS_EMBED,
       internal_exam_codes!consumed_session_id(void_reason, exam_sitting_entries!internal_exam_codes_sitting_entry_fkey(sitting_id, exam_sittings!exam_sitting_entries_sitting_id_organization_id_fkey(scheduled_at)))`

/** Data select (`'data'`) or count select (`'count'`), plus the inner embeds the set filters need. */
function attemptSelect(kind: 'data' | 'count', filters: ListAttemptsFilters): string {
  const inner = filters.search || filters.groupId
  const userCols = kind === 'data' ? 'full_name, email' : 'id'
  const users = inner
    ? `users!student_id!inner(${userCols}${filters.groupId ? `, ${GROUP_FILTER_EMBED}` : ''})`
    : 'users!student_id(full_name, email)'
  const base =
    kind === 'data'
      ? SELECT_COLUMNS.replace('USERS_EMBED', users)
      : `id${inner ? `, ${users}` : ''}`
  return filters.sittingId ? `${base}, ${SITTING_FILTER_EMBED}` : base
}

function selectAttemptsPage(organizationId: string, filters: ListAttemptsFilters, from: number) {
  return (
    applyAttemptFilters(
      offsetAdminClient
        .from('quiz_sessions')
        .select(attemptSelect('data', filters), { count: 'exact' }),
      organizationId,
      filters,
    )
      // id tiebreaker keeps pages stable — started_at is not unique.
      .order('started_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)
  )
}

export async function listInternalExamAttempts(
  filters: ListAttemptsFilters = {},
): Promise<{ rows: InternalExamAttemptRow[]; totalCount: number }> {
  const { organizationId } = await requireAdmin()
  const page = clampPage(filters.page)
  const ctx = {
    tag: 'listInternalExamAttempts',
    failMessage: 'Failed to load internal exam attempts',
  }

  // The requested page is read with its exact total in one query.
  let result = await runOffsetPage<AttemptRowRaw>(
    selectAttemptsPage(organizationId, filters, (page - 1) * PAGE_SIZE),
    ctx,
  )
  if (result.pastEnd) {
    // Snap-to-last-page (#1041): a page past the end returns the last page's rows instead of
    // an empty list, matching PaginationBar's clamped display.
    const countBuilder = applyAttemptFilters(
      offsetAdminClient
        .from('quiz_sessions')
        .select(attemptSelect('count', filters), { count: 'exact', head: true }),
      organizationId,
      filters,
    )
    const total = await runOffsetCount(countBuilder, ctx)
    if (total === 0) return { rows: [], totalCount: 0 }
    const lastPage = Math.min(page, Math.max(1, Math.ceil(total / PAGE_SIZE)))
    result = await runOffsetPage<AttemptRowRaw>(
      selectAttemptsPage(organizationId, filters, (lastPage - 1) * PAGE_SIZE),
      ctx,
    )
    // A concurrent delete can leave the re-read past the end too: empty page, recount total.
    if (result.pastEnd) return { rows: [], totalCount: total }
  }
  const { rows: raw, count: totalCount } = result
  if (totalCount === 0) {
    return { rows: [], totalCount }
  }

  const { data: itemCounts, error: itemCountsError } = await fetchAnsweredItemCounts(
    raw.map((r) => r.id),
    adminClient as unknown as AnswerCountClient,
  )
  if (itemCountsError) {
    console.error(`[${ctx.tag}] item count error:`, itemCountsError.message)
    throw new Error(ctx.failMessage)
  }
  const rows: InternalExamAttemptRow[] = raw.map((r) => mapAttemptRow(r, itemCounts.get(r.id) ?? 0))
  return { rows, totalCount }
}
