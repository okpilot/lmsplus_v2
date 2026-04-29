export type InternalExamCodeStatus = 'active' | 'consumed' | 'expired' | 'voided'

export type InternalExamCodeRow = {
  id: string
  code: string
  subjectId: string
  subjectName: string
  studentId: string
  studentName: string
  studentEmail: string
  issuedBy: string
  issuedAt: string
  expiresAt: string
  consumedAt: string | null
  consumedSessionId: string | null
  voidedAt: string | null
  voidedBy: string | null
  voidReason: string | null
  status: InternalExamCodeStatus
  sessionEndedAt: string | null
}

export type ListCodesFilters = {
  status?: InternalExamCodeStatus | 'finished'
  studentId?: string
  subjectId?: string
  limit?: number
  cursor?: string
}

export type InternalExamAttemptRow = {
  sessionId: string
  studentId: string
  studentName: string
  studentEmail: string
  subjectId: string
  subjectName: string
  startedAt: string
  endedAt: string | null
  totalQuestions: number | null
  correctCount: number | null
  scorePercentage: number | null
  passed: boolean | null
  voidReason: string | null
}

export type ListAttemptsFilters = {
  studentId?: string
  subjectId?: string
  limit?: number
  cursor?: string
}

export type OrgStudentOption = {
  id: string
  fullName: string
  email: string
}

export type ExamSubjectOption = {
  id: string
  code: string
  name: string
}
