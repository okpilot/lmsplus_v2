import { requireAdmin } from '@/lib/auth/require-admin'
import {
  type OffsetChainBuilder,
  offsetAdminClient,
  runOffsetCount,
  runOffsetRows,
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

export async function listInternalExamAttempts(
  filters: ListAttemptsFilters = {},
): Promise<{ rows: InternalExamAttemptRow[]; totalCount: number }> {
  const { organizationId } = await requireAdmin()
  const page = clampPage(filters.page)
  const client = offsetAdminClient

  const countBuilder = applyAttemptFilters(
    client.from('quiz_sessions').select('id', { count: 'exact', head: true }),
    organizationId,
    filters,
  )
  const ctx = {
    tag: 'listInternalExamAttempts',
    failMessage: 'Failed to load internal exam attempts',
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

  const dataBuilder = applyAttemptFilters(
    client.from('quiz_sessions').select(
      `id, student_id, subject_id, started_at, ended_at, total_questions,
       correct_count, score_percentage, passed,
       easa_subjects!subject_id(name),
       users!student_id(full_name, email),
       internal_exam_codes!consumed_session_id(void_reason)`,
    ),
    organizationId,
    filters,
  )
    // id tiebreaker keeps pages stable — started_at is not unique.
    .order('started_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, to)

  const raw = await runOffsetRows<AttemptRowRaw>(dataBuilder, ctx)
  const rows: InternalExamAttemptRow[] = raw.map(mapAttemptRow)
  return { rows, totalCount }
}
