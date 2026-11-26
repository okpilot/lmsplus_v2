import { requireAdmin } from '@/lib/auth/require-admin'
import {
  type OffsetChainBuilder,
  offsetAdminClient,
  runOffsetCount,
  runOffsetRows,
} from './_offset-query'
import { type CodeRowRaw, mapCodeRow } from './_row-mappers'
import { clampPage, PAGE_SIZE } from './pagination'
import type { InternalExamCodeRow, ListCodesFilters } from './types'

// The sitting embeds carry no `deleted_at IS NULL`: docs/security.md §15 (g) for `exam_sittings`
// (cancel soft-deletes it, and the row still names the sitting this code belonged to). The
// `exam_sitting_entries` hop is outside (g) and PostgREST can only filter it by promoting the embed
// to an inner join, which would drop every legacy code (they have no entry). `deriveStatus` ranks
// `voided` above the embed, and removal and cancel both
// void first (`private.void_unused_sitting_codes`), so no status reads a soft-deleted row.
const CODE_COLS_BASE = `id, code, subject_id, student_id, issued_by, issued_at, expires_at,
       consumed_at, consumed_session_id, voided_at, voided_by, void_reason, emailed_at, sitting_entry_id,
       exam_sitting_entries!internal_exam_codes_sitting_entry_fkey(sitting_id, exam_sittings!exam_sitting_entries_sitting_id_organization_id_fkey(status)),
       easa_subjects!subject_id(name),
       users!student_id(full_name, email)`

/**
 * Applies org scope, soft-delete filter, and status/student/subject predicates to a codes query builder.
 * `nowIso` is passed in (not computed here) so the count and data queries share the same instant.
 */
// biome-ignore lint/complexity/useMaxParams: pre-existing; split when next edited (#1606)
function applyCodeFilters(
  builder: OffsetChainBuilder,
  organizationId: string,
  filters: ListCodesFilters,
  nowIso: string,
): OffsetChainBuilder {
  let b = builder.eq('organization_id', organizationId).is('deleted_at', null)
  if (filters.studentId) b = b.eq('student_id', filters.studentId)
  if (filters.subjectId) b = b.eq('subject_id', filters.subjectId)
  switch (filters.status) {
    case 'voided':
      return b.not('voided_at', 'is', null)
    case 'expired':
      return b.is('voided_at', null).is('consumed_at', null).lte('expires_at', nowIso)
    case 'consumed':
      // This service-role read sees soft-deleted sessions, so in-flight needs both filters.
      return b
        .not('consumed_at', 'is', null)
        .is('voided_at', null)
        .is('quiz_sessions.ended_at', null)
        .is('quiz_sessions.deleted_at', null)
    case 'discarded':
      // Only this service-role read sees the session row, so only here is the state filterable.
      // Ended or not: a soft-deleted attempt is discarded (`codeDisplayStatus`).
      return b
        .not('consumed_at', 'is', null)
        .is('voided_at', null)
        .not('quiz_sessions.deleted_at', 'is', null)
    case 'finished':
      // Ended AND still live — an ended-then-deleted attempt belongs under `discarded`.
      return b
        .not('consumed_at', 'is', null)
        .is('voided_at', null)
        .not('quiz_sessions.ended_at', 'is', null)
        .is('quiz_sessions.deleted_at', null)
    case 'active':
      return b.is('consumed_at', null).is('voided_at', null).gt('expires_at', nowIso)
    default:
      return b
  }
}

export async function listInternalExamCodes(
  filters: ListCodesFilters = {},
): Promise<{ rows: InternalExamCodeRow[]; totalCount: number }> {
  const { organizationId } = await requireAdmin()
  const page = clampPage(filters.page)
  const client = offsetAdminClient
  const nowIso = new Date().toISOString()
  // 'consumed', 'finished' and 'discarded' filter the embedded session on ended_at, deleted_at or
  // both → all three need an INNER join on BOTH selects (a count select filtering a
  // quiz_sessions column without !inner 400s — PostgREST PGRST108).
  const splitOnSession =
    filters.status === 'consumed' || filters.status === 'finished' || filters.status === 'discarded'
  const embed = splitOnSession
    ? 'quiz_sessions!consumed_session_id!inner(ended_at, deleted_at)'
    : 'quiz_sessions!consumed_session_id(ended_at, deleted_at)'

  const countBuilder = applyCodeFilters(
    client
      .from('internal_exam_codes')
      .select(splitOnSession ? `id, ${embed}` : 'id', { count: 'exact', head: true }),
    organizationId,
    filters,
    nowIso,
  )
  const ctx = {
    tag: 'listInternalExamCodes',
    failMessage: 'Failed to load internal exam codes',
  }
  const totalCount = await runOffsetCount(countBuilder, ctx)
  if (totalCount === 0) {
    return { rows: [], totalCount }
  }
  // Snap-to-last-page (#1041): an out-of-range page returns the last page's rows instead of
  // an empty list, matching PaginationBar's clamped display. Count-first fetches the count before querying the effective page.
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const effectivePage = Math.min(page, totalPages)
  const from = (effectivePage - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  const dataBuilder = applyCodeFilters(
    client.from('internal_exam_codes').select(`${CODE_COLS_BASE},\n       ${embed}`),
    organizationId,
    filters,
    nowIso,
  )
    .order('issued_at', { ascending: false })
    .order('id', { ascending: false }) // id tiebreaker keeps pages stable (issued_at not unique)
    .range(from, to)

  const raw = await runOffsetRows<CodeRowRaw>(dataBuilder, ctx)
  // Derive status against the same instant the active/expired SQL filters used (nowIso).
  const nowMs = new Date(nowIso).getTime()
  const rows: InternalExamCodeRow[] = raw.map((r) => mapCodeRow(r, nowMs))
  return { rows, totalCount }
}
