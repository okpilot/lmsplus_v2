import type { InternalExamCodeStatus } from './types'
export type VoidPolicyInput = {
  sittingEntryId: string | null
  consumed: boolean
  /** `ended_at` of the consumed attempt, or null when it has not ended. */
  sessionEndedAt: string | null
  /**
   * Whether the attempt's session row is visible to this caller. The codes list reads it with the
   * service role, the void guard through RLS (`instructors_read_sessions` hides a soft-deleted
   * row), so the two can disagree. An invisible session is not treated as running: the guard fails
   * closed and `void_sitting_code` refuses the code too (`code_in_use`).
   */
  sessionVisible: boolean
}

/**
 * Decision 264: a sitting code is voided from its sitting, not the codes tab. The exception is a
 * consumed code whose attempt is still running — the sitting page offers Void only for a waiting or
 * ready entry, so the codes tab is its only stop button. A legacy code (no sitting entry) is always
 * voidable here.
 */
export function sittingCodeVoidable(input: VoidPolicyInput): boolean {
  if (input.sittingEntryId === null) return true
  return input.consumed && input.sessionVisible && input.sessionEndedAt === null
}

/** The codes list reads with the service role, so a soft-deleted session is visible to it alone. */
export function codeRowVoidable(
  row: Readonly<{
    sittingEntryId: string | null
    status: string
    sessionEndedAt: string | null
    sessionDeletedAt: string | null
  }>,
): boolean {
  return sittingCodeVoidable({
    sittingEntryId: row.sittingEntryId,
    consumed: row.status === 'consumed',
    sessionEndedAt: row.sessionEndedAt,
    sessionVisible: row.sessionDeletedAt === null,
  })
}

export type CodeDisplayStatus = InternalExamCodeStatus | 'finished' | 'discarded'

/**
 * What the row badge reads. Deletion first: a soft-deleted attempt is discarded whether or not it
 * ended, the order `list_exam_sitting_roster` and `get_quiz_progress` use. The two screens must
 * agree.
 */
export function codeDisplayStatus(
  row: Readonly<{
    status: InternalExamCodeStatus
    sessionEndedAt: string | null
    sessionDeletedAt: string | null
  }>,
): CodeDisplayStatus {
  if (row.status !== 'consumed') return row.status
  if (row.sessionDeletedAt) return 'discarded'
  if (row.sessionEndedAt) return 'finished'
  return 'consumed'
}

/**
 * `void_internal_exam_code` locks a consumed code's session with a `deleted_at IS NULL` filter, so
 * the two states raise different tokens: a DELETED session (ended or not) is not found and raises
 * `session_state_changed`; an ENDED, still-live session raises `cannot_void_finished_attempt`.
 * Deleted wins over ended, matching `codeDisplayStatus` above.
 * Which codes reach this at all is `codeRowVoidable`'s business, not this function's — two earlier
 * versions of this block stated that scope and both got it wrong.
 */
export function codeVoidDisabled(
  row: Readonly<{
    status: InternalExamCodeStatus
    sessionEndedAt: string | null
    sessionDeletedAt: string | null
  }>,
): boolean {
  if (row.status === 'voided') return true
  return row.status === 'consumed' && (row.sessionEndedAt !== null || row.sessionDeletedAt !== null)
}
