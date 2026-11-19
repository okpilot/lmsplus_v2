export type InternalExamCodeStatus = 'active' | 'waiting' | 'consumed' | 'expired' | 'voided'

/** Every status the codes filter accepts, in the order the Select offers them. */
export const CODE_FILTER_STATUSES = [
  'active',
  'consumed',
  'finished',
  'discarded',
  'voided',
  'expired',
] as const

export type CodeFilterStatus = (typeof CODE_FILTER_STATUSES)[number]

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
  /** `deleted_at` of the consumed attempt; RLS hides a soft-deleted session from the void guard. */
  sessionDeletedAt: string | null
}

export type ListCodesFilters = {
  status?: CodeFilterStatus
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
  sittingId?: string | null
  sittingAt?: string | null
}

export type ListAttemptsFilters = {
  studentId?: string
  subjectId?: string
  search?: string
  sittingId?: string
  groupId?: string
  page?: number
}

export type AttemptFilterOptions = {
  subjects: { id: string; name: string }[]
  sittings: { id: string; label: string }[]
  groups: { id: string; name: string }[]
}

export type AttemptUrlFilters = {
  q?: string
  subject?: string
  sitting?: string
  group?: string
}
