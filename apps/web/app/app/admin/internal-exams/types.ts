export type InternalExamCodeStatus = 'active' | 'waiting' | 'consumed' | 'expired' | 'voided'

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
  emailedAt: string | null
  status: InternalExamCodeStatus
  sittingId: string | null
  sittingEntryId: string | null
  sessionEndedAt: string | null
}

export type ListCodesFilters = {
  status?: Exclude<InternalExamCodeStatus, 'waiting'> | 'finished'
  studentId?: string
  subjectId?: string
  page?: number
}

export type InternalExamAttemptRow = {
  sessionId: string
  studentId: string
  studentName: string
  studentEmail: string
  subjectId: string | null
  subjectName: string
  startedAt: string
  endedAt: string | null
  totalQuestions: number | null
  correctCount: number | null
  answeredItems: number
  scorePercentage: number | null
  passed: boolean | null
  voidReason: string | null
}

export type ListAttemptsFilters = {
  studentId?: string
  subjectId?: string
  page?: number
}
