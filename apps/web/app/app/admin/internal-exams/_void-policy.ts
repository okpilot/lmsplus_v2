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
