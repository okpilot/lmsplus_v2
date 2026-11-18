export const SITTING_BASE = '/app/admin/internal-exams/sittings'

export type SittingScope = 'upcoming' | 'open' | 'past' | 'cancelled'
export const SITTING_SCOPES: readonly SittingScope[] = ['upcoming', 'open', 'past', 'cancelled']

export const SITTINGS_PAGE_SIZE = 50

export type SittingStatus = 'scheduled' | 'open' | 'closed' | 'cancelled'

export type SittingRow = {
  id: string
  scheduledAt: string
  mode: 'remote' | 'in_person'
  status: SittingStatus
  invigilatorId: string
  invigilatorName: string
  invigilatorActive: boolean
  startedAt: string | null
  closedAt: string | null
  candidates: number
  entries: number
  entriesWithoutCode: number
  entriesFinished: number
  entriesAbsent: number
  endedAutomatically: boolean
}

export type SittingSummary = {
  status: SittingStatus
  scheduledAt: string
  candidates: number
  deactivatedCandidates: number
  entries: number
  codesIssued: number
  entriesWithAttempt: number
  pendingRemovalNotices: number
  dayEnded: boolean
  attemptsRunning: number
  entriesNotStarted: number
  studentsNotStarted: number
  entriesWithoutCode: number
  entriesIssuable: number
}

export type InvigilatorOption = { id: string; name: string }

export const ROSTER_PAGE_SIZE = 50

/** Entries holding a usable, unspent code. */
export const LIVE_ENTRY_STATUSES: ReadonlySet<string> = new Set(['waiting', 'ready'])

export const NEEDS_CODE_STATUSES_LIST = ['no_code', 'expired', 'voided'] as const
export type NeedsCodeStatus = (typeof NEEDS_CODE_STATUSES_LIST)[number]
/** Entries that need a (new) code. */
export const NEEDS_CODE_STATUSES: ReadonlySet<string> = new Set(NEEDS_CODE_STATUSES_LIST)

export const ENTRY_STATUSES = [
  'no_code',
  'waiting',
  'ready',
  'expired',
  'voided',
  'voided_attempt',
  'running',
  'finished',
  'absent',
  'discarded',
] as const
export type EntryStatus = (typeof ENTRY_STATUSES)[number]

export const SITTING_ROOT = '/app/admin/internal-exams'

export type RosterEntry = {
  entryId: string
  subjectId: string
  subjectShort: string
  subjectName: string
  courseId: string | null
  courseName: string | null
  status: EntryStatus
  attemptNumber: number | null
  passed: boolean | null
  score: number | null
  codeId: string | null
  code: string | null
  codeExpiresAt: string | null
  codeEmailedAt: string | null
  voidReason: string | null
  sessionId: string | null
  sessionStartedAt: string | null
}

export type RosterRow = {
  userId: string
  name: string
  email: string
  deactivated: boolean
  hasAttempt: boolean
  entries: RosterEntry[]
}

export type RemovedEntryRow = {
  entryId: string
  userId: string
  studentName: string
  subjectShort: string
  passedAt: string | null
  removedAt: string
  noticeSent: boolean
}

/** URL value of the Show filter; `attempts` maps to the RPC value `has_attempts`. */
export type ShowValue = 'all' | 'needs_code' | 'attempts'
export const SHOW_VALUES: readonly ShowValue[] = ['all', 'needs_code', 'attempts']
