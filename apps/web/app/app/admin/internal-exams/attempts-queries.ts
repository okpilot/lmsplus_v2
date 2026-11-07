import { adminClient } from '@repo/db/admin'
import { requireAdmin } from '@/lib/auth/require-admin'
import type { AnswerCountClient } from '@/lib/queries/answered-item-counts'
import { fetchAnsweredItemCounts } from '@/lib/queries/answered-item-counts'
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
  return b
}

const SELECT_COLUMNS = `id, student_id, subject_id, started_at, ended_at, total_questions,
       correct_count, score_percentage, passed,
       easa_subjects!subject_id(name),
       users!student_id(full_name, email),
       internal_exam_codes!consumed_session_id(void_reason)`

function selectAttemptsPage(organizationId: string, filters: ListAttemptsFilters, from: number) {
  return (
    applyAttemptFilters(
      offsetAdminClient.from('quiz_sessions').select(SELECT_COLUMNS, { count: 'exact' }),
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
      offsetAdminClient.from('quiz_sessions').select('id', { count: 'exact', head: true }),
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
