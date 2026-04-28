import { requireAdmin } from '@/lib/auth/require-admin'
import type {
  InternalExamAttemptRow,
  InternalExamCodeRow,
  InternalExamCodeStatus,
  ListAttemptsFilters,
  ListCodesFilters,
} from './types'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

function clampLimit(limit?: number): number {
  if (typeof limit !== 'number' || limit <= 0) return DEFAULT_LIMIT
  return Math.min(limit, MAX_LIMIT)
}

function deriveStatus(row: {
  consumed_at: string | null
  voided_at: string | null
  expires_at: string
}): InternalExamCodeStatus {
  if (row.voided_at) return 'voided'
  if (row.consumed_at) return 'consumed'
  if (new Date(row.expires_at).getTime() <= Date.now()) return 'expired'
  return 'active'
}

type CodeRowRaw = {
  id: string
  code: string
  subject_id: string
  student_id: string
  issued_by: string
  issued_at: string
  expires_at: string
  consumed_at: string | null
  consumed_session_id: string | null
  voided_at: string | null
  voided_by: string | null
  void_reason: string | null
  easa_subjects: { name: string | null } | null
  users: { full_name: string | null; email: string | null } | null
  quiz_sessions: { ended_at: string | null } | null
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

export async function listInternalExamCodes(
  filters: ListCodesFilters = {},
): Promise<{ rows: InternalExamCodeRow[]; nextCursor: string | null }> {
  const { supabase, organizationId } = await requireAdmin()
  const limit = clampLimit(filters.limit)
  const client = supabase as unknown as AnyClient

  const builder = client
    .from('internal_exam_codes')
    .select(
      `id, code, subject_id, student_id, issued_by, issued_at, expires_at,
       consumed_at, consumed_session_id, voided_at, voided_by, void_reason,
       easa_subjects(name),
       users:student_id(full_name, email),
       quiz_sessions:consumed_session_id(ended_at)`,
    )
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .order('issued_at', { ascending: false })
    .limit(limit + 1)

  const { data, error } = (await (builder as unknown as PromiseLike<{
    data: unknown
    error: { message: string } | null
  }>)) ?? { data: null, error: null }
  if (error) throw new Error(`[listInternalExamCodes] ${error.message}`)
  const raw = Array.isArray(data) ? (data as CodeRowRaw[]) : []

  let mapped: InternalExamCodeRow[] = raw.map((r) => ({
    id: r.id,
    code: r.code,
    subjectId: r.subject_id,
    subjectName: r.easa_subjects?.name ?? '',
    studentId: r.student_id,
    studentName: r.users?.full_name ?? '',
    studentEmail: r.users?.email ?? '',
    issuedBy: r.issued_by,
    issuedAt: r.issued_at,
    expiresAt: r.expires_at,
    consumedAt: r.consumed_at,
    consumedSessionId: r.consumed_session_id,
    voidedAt: r.voided_at,
    voidedBy: r.voided_by,
    voidReason: r.void_reason,
    status: deriveStatus({
      consumed_at: r.consumed_at,
      voided_at: r.voided_at,
      expires_at: r.expires_at,
    }),
    sessionEndedAt: r.quiz_sessions?.ended_at ?? null,
  }))

  if (filters.status) mapped = mapped.filter((r) => r.status === filters.status)
  if (filters.studentId) mapped = mapped.filter((r) => r.studentId === filters.studentId)
  if (filters.subjectId) mapped = mapped.filter((r) => r.subjectId === filters.subjectId)

  const hasMore = mapped.length > limit
  const rows = hasMore ? mapped.slice(0, limit) : mapped
  const nextCursor = hasMore ? (rows[rows.length - 1]?.issuedAt ?? null) : null

  return { rows, nextCursor }
}

export async function listInternalExamAttempts(
  filters: ListAttemptsFilters = {},
): Promise<{ rows: InternalExamAttemptRow[]; nextCursor: string | null }> {
  const { supabase, organizationId } = await requireAdmin()
  const limit = clampLimit(filters.limit)
  const client = supabase as unknown as AnyClient

  const builder = client
    .from('quiz_sessions')
    .select(
      `id, student_id, subject_id, started_at, ended_at, total_questions,
       correct_count, score_percentage, passed,
       easa_subjects(name),
       users:student_id(full_name, email),
       internal_exam_codes:consumed_session_id(void_reason)`,
    )
    .eq('organization_id', organizationId)
    .eq('mode', 'internal_exam')
    .not('ended_at', 'is', null)
    .is('deleted_at', null)
    .order('started_at', { ascending: false })
    .limit(limit + 1)

  const { data, error } = (await (builder as unknown as PromiseLike<{
    data: unknown
    error: { message: string } | null
  }>)) ?? { data: null, error: null }
  if (error) throw new Error(`[listInternalExamAttempts] ${error.message}`)
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

  if (filters.studentId) mapped = mapped.filter((r) => r.studentId === filters.studentId)
  if (filters.subjectId) mapped = mapped.filter((r) => r.subjectId === filters.subjectId)

  const hasMore = mapped.length > limit
  const rows = hasMore ? mapped.slice(0, limit) : mapped
  const nextCursor = hasMore ? (rows[rows.length - 1]?.startedAt ?? null) : null

  return { rows, nextCursor }
}
