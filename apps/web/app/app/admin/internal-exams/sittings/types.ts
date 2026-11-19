import type { SittingMode } from '@/lib/utils/sitting-mode-label'

export const SITTING_BASE = '/app/admin/internal-exams/sittings'

export type SittingScope = 'upcoming' | 'open' | 'past' | 'cancelled'
export const SITTING_SCOPES: readonly SittingScope[] = ['upcoming', 'open', 'past', 'cancelled']

export const SITTINGS_PAGE_SIZE = 50

export type SittingStatus = 'scheduled' | 'open' | 'closed' | 'cancelled'

export type SittingRow = {
  id: string
  scheduledAt: string
  mode: SittingMode
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

/** Most people a bulk action may tick. Here, not in `parse-sitting-params`: that module builds
 * Zod schemas at module scope and client components read this constant. */
export const MAX_TICKS = 100

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

export const PEOPLE_PAGE_SIZE = 50

/** A student who can be added to the sitting (Add people popup). */
export type AddablePerson = {
  userId: string
  name: string
  email: string
  deactivated: boolean
  groups: string
  courses: string
}

/** One exam of the Add exams popup, aggregated over the picked people. */
export type SubjectEligibility = {
  subjectId: string
  subjectName: string
  subjectShort: string
  courseId: string | null
  courseName: string | null
  people: number
  eligible: number
  enteredHere: number
  passed: number
  attemptRunning: number
  enteredElsewhere: number
  notEnrolled: number
  deactivated: number
  /** Pair state; only set when exactly one person was picked. */
  state: string | null
  attemptCount: number | null
  passedAt: string | null
  passedScore: number | null
  elsewhereSittingId: string | null
  elsewhereAt: string | null
}

export type IssuePreviewDetail = {
  entryId: string
  student: string
  subjectShort: string
  reason: string
}

export type IssuePreview = {
  /** Entries per plan reason (`issue`, `reissue_after_expiry`, `already_issued`, skip reasons). */
  counts: Record<string, number>
  studentsToIssue: number
  /** Skipped entries other than `already_issued`, at most 200. */
  details: IssuePreviewDetail[]
}

export type GroupAddCounts = { activeNew: number; deactivatedNew: number }
export type SameDayPerson = {
  userId: string
  name: string
  sittingId: string
  scheduledAt: string
}

/** A popup read on a closed sitting or after its UTC day: the popup shows `This sitting has ended.` */
export type Ended = { ended: true }
export const ENDED: Ended = { ended: true }

/** Who a popup acts on, resolved server-side from `ids` / `all`. */
export type Selection =
  | { kind: 'all' }
  | { kind: 'ids'; ids: string[]; truncated: boolean }
  | { kind: 'whole' }
  | { kind: 'empty' }
