import { adminClient } from '@repo/db/admin'
import { requireAdmin } from '@/lib/auth/require-admin'
import { type AttemptRowRaw, mapAttemptRow } from './_row-mappers'
import { clampPage, PAGE_SIZE } from './pagination'
import type { InternalExamAttemptRow, ListAttemptsFilters } from './types'

// Narrower than the queries.ts ChainBuilder by design — lte/gt are omitted
// because listInternalExamAttempts never calls them.
type ChainBuilder = {
  select: {
    (cols: string): ChainBuilder
    (cols: string, opts: { count: 'exact'; head: boolean }): ChainBuilder
  }
  eq: (col: string, val: unknown) => ChainBuilder
  is: (col: string, val: null) => ChainBuilder
  not: (col: string, op: string, val: unknown) => ChainBuilder
  order: (col: string, opts: { ascending: boolean }) => ChainBuilder
  range: (from: number, to: number) => ChainBuilder
}

type AnyClient = {
  from: (t: string) => ChainBuilder
}

function applyAttemptFilters(
  builder: ChainBuilder,
  organizationId: string,
  filters: ListAttemptsFilters,
): ChainBuilder {
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
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1
  // adminClient: same RLS-recursion reason as listInternalExamCodes — embed of `users`
  // returns null under the user-scoped client.
  const client = adminClient as unknown as AnyClient

  // Count first — PostgREST returns 416 (and a null count) for out-of-range .range() requests.
  const countBuilder = applyAttemptFilters(
    client.from('quiz_sessions').select('id', { count: 'exact', head: true }),
    organizationId,
    filters,
  )
  const { count, error: countError } = (await (countBuilder as unknown as PromiseLike<{
    count: number | null
    error: { message: string } | null
  }>)) ?? { count: null, error: null }
  if (countError) {
    console.error('[listInternalExamAttempts] count error:', countError.message)
    throw new Error('Failed to load internal exam attempts')
  }
  const totalCount = count ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  if (totalCount === 0 || page > totalPages) {
    return { rows: [], totalCount }
  }

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

  const { data, error } = (await (dataBuilder as unknown as PromiseLike<{
    data: unknown
    error: { message: string } | null
  }>)) ?? { data: null, error: null }
  if (error) {
    console.error('[listInternalExamAttempts] DB error:', error.message)
    throw new Error('Failed to load internal exam attempts')
  }
  const raw = Array.isArray(data) ? (data as AttemptRowRaw[]) : []
  const rows: InternalExamAttemptRow[] = raw.map(mapAttemptRow)
  return { rows, totalCount }
}
