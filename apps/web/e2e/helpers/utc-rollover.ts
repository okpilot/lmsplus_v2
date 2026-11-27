import { test } from '@playwright/test'

/** Minutes before midnight UTC within which a sitting spec must not start. */
export const UTC_ROLLOVER_MARGIN_MINUTES = 15

/** Whether `now` is inside the margin before midnight UTC. */
export function isNearUtcRollover(now: Date): boolean {
  const minutesLeft = (24 - now.getUTCHours()) * 60 - now.getUTCMinutes()
  return minutesLeft <= UTC_ROLLOVER_MARGIN_MINUTES
}

/**
 * Skips the current test when it would straddle midnight UTC.
 *
 * Every sitting guard keys off the sitting's UTC day: `private.sitting_lock(_, _, true)` raises
 * `sitting_day_ended` once `now()` passes it (`supabase/migrations/20261116000400_private_sitting_guard_helpers.sql`),
 * `private.sitting_code_expiry` expires the issued code, `close_expired_sittings` closes the
 * sitting, and `utcDay()` renders the next date. A spec that creates a sitting near midnight and
 * runs for minutes fails on whichever of those turns over first.
 *
 * Call it per test — from `beforeEach` or inside the test body — not at module load (a module-load
 * skip is evaluated when the file is imported, long before the body runs). A `beforeAll` call skips
 * the whole suite; `beforeEach` and in-test calls skip the current test. Keep both in a suite that
 * seeds in `beforeAll`: the `beforeAll` call catches a suite that starts inside the margin, the
 * `beforeEach` call catches a rollover that arrives part-way through.
 */
export function skipNearUtcRollover(): void {
  test.skip(isNearUtcRollover(new Date()), 'UTC day rollover window')
}
