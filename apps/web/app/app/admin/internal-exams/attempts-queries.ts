import { adminClient } from '@repo/db/admin'
import { requireAdmin } from '@/lib/auth/require-admin'
import type { InternalExamAttemptRow, ListAttemptsFilters } from './types'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

function clampLimit(limit?: number): number {
  if (typeof limit !== 'number' || limit <= 0) return DEFAULT_LIMIT
  return Math.min(limit, MAX_LIMIT)
}

type AttemptRowRaw = {
  id: string
  student_id: string
  subject_id: string | null
  started_at: string
  ended_at: string | null
  total_questions: number | null
  correct_count: number | null
  score_percentage: number | null
  passed: boolean | null
  easa_subjects: { name: string | null } | null
  users: { full_name: string | null; email: string | null } | null
  internal_exam_codes: { void_reason: string | null }[] | null
}

// Narrower than the queries.ts ChainBuilder by design — lte/gt are omitted
// because listInternalExamAttempts never calls them.
type ChainBuilder = {
  select: (cols: string) => ChainBuilder
  eq: (col: string, val: unknown) => ChainBuilder
  is: (col: string, val: null) => ChainBuilder
  not: (col: string, op: string, val: unknown) => ChainBuilder
  order: (col: string, opts: { ascending: boolean }) => ChainBuilder
  limit: (n: number) => ChainBuilder
}

type AnyClient = {
  from: (t: string) => ChainBuilder
}

export async function listInternalExamAttempts(
  filters: ListAttemptsFilters = {},
): Promise<{ rows: InternalExamAttemptRow[]; nextCursor: string | null }> {
  const { organizationId } = await requireAdmin()
  const limit = clampLimit(filters.limit)
  // adminClient: same RLS-recursion reason as listInternalExamCodes — embed of `users`
  // returns null under the user-scoped client.
  const client = adminClient as unknown as AnyClient

  let builder = client
    .from('quiz_sessions')
    .select(
      `id, student_id, subject_id, started_at, ended_at, total_questions,
       correct_count, score_percentage, passed,
       easa_subjects(name),
       users!student_id(full_name, email),
       internal_exam_codes!consumed_session_id(void_reason)`,
    )
    .eq('organization_id', organizationId)
    .eq('mode', 'internal_exam')
    .not('ended_at', 'is', null)
    .is('deleted_at', null)

  if (filters.studentId) builder = builder.eq('student_id', filters.studentId)
  if (filters.subjectId) builder = builder.eq('subject_id', filters.subjectId)

  builder = builder.order('started_at', { ascending: false }).limit(limit + 1)

  const { data, error } = (await (builder as unknown as PromiseLike<{
    data: unknown
    error: { message: string } | null
  }>)) ?? { data: null, error: null }
  if (error) {
    console.error('[listInternalExamAttempts] DB error:', error.message)
    throw new Error('Failed to load internal exam attempts')
  }
  const raw = Array.isArray(data) ? (data as AttemptRowRaw[]) : []

  let mapped: InternalExamAttemptRow[] = raw.map((r) => ({
    sessionId: r.id,
    studentId: r.student_id,
    studentName: r.users?.full_name ?? '',
    studentEmail: r.users?.email ?? '',
    subjectId: r.subject_id ?? '',
    subjectName: r.easa_subjects?.name ?? '',
    startedAt: r.started_at,
    endedAt: r.ended_at,
    totalQuestions: r.total_questions,
    correctCount: r.correct_count,
    scorePercentage: r.score_percentage,
    passed: r.passed,
    voidReason: r.internal_exam_codes?.[0]?.void_reason ?? null,
  }))

  // SQL filters above are primary; TS guards preserve safety on already-paginated rows.
  if (filters.studentId) mapped = mapped.filter((r) => r.studentId === filters.studentId)
  if (filters.subjectId) mapped = mapped.filter((r) => r.subjectId === filters.subjectId)

  const hasMore = mapped.length > limit
  const rows = hasMore ? mapped.slice(0, limit) : mapped
  const nextCursor = hasMore ? (rows[rows.length - 1]?.startedAt ?? null) : null

  return { rows, nextCursor }
}
