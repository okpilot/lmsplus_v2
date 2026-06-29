import { adminClient } from '@repo/db/admin'
import { requireAdmin } from '@/lib/auth/require-admin'
import { clampLimit } from './pagination'
import type {
  ExamSubjectOption,
  InternalExamCodeRow,
  InternalExamCodeStatus,
  ListCodesFilters,
} from './types'

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
  emailed_at: string | null
  easa_subjects: { name: string | null } | null
  users: { full_name: string | null; email: string | null } | null
  quiz_sessions: { ended_at: string | null } | null
}

type ChainBuilder = {
  select: (cols: string) => ChainBuilder
  eq: (col: string, val: unknown) => ChainBuilder
  is: (col: string, val: null) => ChainBuilder
  not: (col: string, op: string, val: unknown) => ChainBuilder
  lte: (col: string, val: unknown) => ChainBuilder
  gt: (col: string, val: unknown) => ChainBuilder
  order: (col: string, opts: { ascending: boolean }) => ChainBuilder
  limit: (n: number) => ChainBuilder
}

type AnyClient = {
  from: (t: string) => ChainBuilder
}

export async function listInternalExamCodes(
  filters: ListCodesFilters = {},
): Promise<{ rows: InternalExamCodeRow[]; nextCursor: string | null }> {
  const { organizationId } = await requireAdmin()
  const limit = clampLimit(filters.limit)
  // adminClient: cross-row reads on `users` are unreliable under tenant_isolation RLS
  // (self-referential subquery), and PostgREST applies RLS to embedded resources too.
  const client = adminClient as unknown as AnyClient

  let builder = client
    .from('internal_exam_codes')
    .select(
      `id, code, subject_id, student_id, issued_by, issued_at, expires_at,
       consumed_at, consumed_session_id, voided_at, voided_by, void_reason, emailed_at,
       easa_subjects(name),
       users!student_id(full_name, email),
       quiz_sessions!consumed_session_id(ended_at)`,
    )
    .eq('organization_id', organizationId)
    .is('deleted_at', null)

  if (filters.studentId) builder = builder.eq('student_id', filters.studentId)
  if (filters.subjectId) builder = builder.eq('subject_id', filters.subjectId)

  const nowIso = new Date().toISOString()
  switch (filters.status) {
    case 'voided':
      builder = builder.not('voided_at', 'is', null)
      break
    case 'expired':
      builder = builder.is('voided_at', null).is('consumed_at', null).lte('expires_at', nowIso)
      break
    case 'consumed':
    case 'finished':
      builder = builder.not('consumed_at', 'is', null).is('voided_at', null)
      break
    case 'active':
      builder = builder.is('consumed_at', null).is('voided_at', null).gt('expires_at', nowIso)
      break
    default:
      break
  }

  builder = builder.order('issued_at', { ascending: false }).limit(limit + 1)

  const { data, error } = (await (builder as unknown as PromiseLike<{
    data: unknown
    error: { message: string } | null
  }>)) ?? { data: null, error: null }
  if (error) {
    console.error('[listInternalExamCodes] DB error:', error.message)
    throw new Error('Failed to load internal exam codes')
  }
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
    emailedAt: r.emailed_at,
    status: deriveStatus({
      consumed_at: r.consumed_at,
      voided_at: r.voided_at,
      expires_at: r.expires_at,
    }),
    sessionEndedAt: r.quiz_sessions?.ended_at ?? null,
  }))

  // SQL above is the primary filter. TS guards below preserve correctness when
  // a caller passes status-derived filters and act as a safety net for the
  // 'consumed' vs 'finished' split (depends on linked quiz_sessions.ended_at).
  if (filters.status === 'finished') {
    mapped = mapped.filter((r) => r.sessionEndedAt !== null)
  } else if (filters.status === 'consumed') {
    mapped = mapped.filter((r) => r.sessionEndedAt === null && r.status === 'consumed')
  } else if (filters.status) {
    mapped = mapped.filter((r) => r.status === filters.status)
  }
  if (filters.studentId) mapped = mapped.filter((r) => r.studentId === filters.studentId)
  if (filters.subjectId) mapped = mapped.filter((r) => r.subjectId === filters.subjectId)

  const hasMore = mapped.length > limit
  const rows = hasMore ? mapped.slice(0, limit) : mapped
  const nextCursor = hasMore ? (rows[rows.length - 1]?.issuedAt ?? null) : null

  return { rows, nextCursor }
}

type SubjectRowRaw = { id: string; code: string; name: string }

export async function listExamSubjects(): Promise<ExamSubjectOption[]> {
  const { supabase, organizationId } = await requireAdmin()

  const { data, error } = await supabase
    .from('exam_configs')
    .select('subject_id, easa_subjects!subject_id(id, code, name)')
    .eq('organization_id', organizationId)
    .eq('enabled', true)
    .is('deleted_at', null)

  if (error) {
    console.error('[listExamSubjects] DB error:', error.message)
    throw new Error('Failed to load subjects')
  }

  type Joined = { easa_subjects: SubjectRowRaw | null }
  const rows = (data ?? []) as Joined[]
  return rows
    .map((r) => r.easa_subjects)
    .filter((s): s is SubjectRowRaw => s !== null)
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((s) => ({ id: s.id, code: s.code, name: s.name }))
}
