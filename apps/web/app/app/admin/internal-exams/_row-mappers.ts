import type { InternalExamAttemptRow, InternalExamCodeRow, InternalExamCodeStatus } from './types'

export type CodeRowRaw = {
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

export type AttemptRowRaw = {
  id: string
  student_id: string
  subject_id: string | null
  started_at: string
  ended_at: string | null
  total_questions: number | null
  correct_count: number | null
  score_percentage: number | string | null
  passed: boolean | null
  easa_subjects: { name: string | null } | null
  users: { full_name: string | null; email: string | null } | null
  internal_exam_codes: { void_reason: string | null }[] | null
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

export function mapCodeRow(r: CodeRowRaw): InternalExamCodeRow {
  return {
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
    status: deriveStatus(r),
    sessionEndedAt: r.quiz_sessions?.ended_at ?? null,
  }
}

export function mapAttemptRow(r: AttemptRowRaw): InternalExamAttemptRow {
  return {
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
    scorePercentage: r.score_percentage != null ? Number(r.score_percentage) : null,
    passed: r.passed,
    voidReason: r.internal_exam_codes?.[0]?.void_reason ?? null,
  }
}
