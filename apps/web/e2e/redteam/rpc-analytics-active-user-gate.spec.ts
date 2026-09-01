/**
 * Red Team: analytics student-read RPCs — active-user gate.
 *
 * Vector FN (HIGH): the active-user gate on the two analytics student read
 * RPCs (`get_daily_activity`, `get_subject_scores`), added by migration
 * 20260824000300. Both previously carried only the `auth.uid()` null-check and
 * the Decision-24 identity guard, so a student soft-deleted via
 * toggle-student-status while holding a still-valid JWT kept reading their own
 * activity history and subject averages — deactivation cascades to neither
 * `student_responses` nor `quiz_sessions`, so the per-row `student_id` filter
 * still matched.
 *
 * Sibling of FM, which covers the identical threat class for the two
 * internal-exam student reads (migration 20260824000200). FM got a red-team
 * vector and this pair did not; this spec closes that asymmetry so both halves
 * of the #883 re-derivation are represented in the dedicated red-team CI job,
 * not only at the Vitest integration tier.
 *
 * Guard order in the RPC body is load-bearing for these assertions:
 *   auth.uid() IS NULL          -> 'not authenticated'
 *   auth.uid() IS DISTINCT FROM p_student_id -> 'forbidden'
 *   users.deleted_at IS NULL    -> 'user not found or inactive'
 * so a caller must pass their OWN id to reach the gate under test.
 *
 * Note the token spelling: this family raises the SPACE-separated
 * 'not authenticated', where the internal-exam family (FM) raises the
 * underscore 'not_authenticated'. Both are correct — see docs/security.md §11c.
 *
 * Status: Expected to PASS. If any assertion fails, the active-user gate has
 * regressed and a deactivated account can still read its own analytics.
 */

import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { seedRedTeamUsers, VICTIM_EMAIL, VICTIM_PASSWORD } from './helpers/seed-users'

test.describe('Red Team: analytics student-read RPCs active-user gate', () => {
  let victimClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let admin: ReturnType<typeof getAdminClient>
  let victimUserId: string
  let attackerUserId: string

  test.beforeAll(async () => {
    const seeded = await seedRedTeamUsers()
    victimUserId = seeded.victimUserId
    attackerUserId = seeded.attackerUserId
    victimClient = await createAuthenticatedClient(VICTIM_EMAIL, VICTIM_PASSWORD)
    admin = getAdminClient()
  })

  test.describe('FN: a soft-deleted caller is rejected by both analytics reads', () => {
    let victimSoftDeleted = false

    // Restore in afterEach, which runs even when the test fails — a stranded soft-deleted
    // victim would poison every downstream spec that authenticates as them. Asserting
    // rows-affected keeps a silently-filtered restore from reading as success.
    test.afterEach(async () => {
      if (!victimSoftDeleted) return
      const { data: restored, error: restoreErr } = await admin
        .from('users')
        .update({ deleted_at: null })
        .eq('id', victimUserId)
        .select('id')
      if (restoreErr) throw new Error(`[FN cleanup] restore victim failed: ${restoreErr.message}`)
      if ((restored?.length ?? 0) === 0)
        throw new Error('[FN cleanup] restore victim affected 0 rows')
      victimSoftDeleted = false
    })

    test('the owner reads their own analytics until soft-deleted, then both RPCs reject', async () => {
      // Positive control — while active, both calls must SUCCEED for this caller. That is what
      // makes the rejection below attributable to the gate: a regression that removed the gate
      // would leave these same two calls succeeding after the soft-delete, failing the asserts.
      //
      // get_daily_activity is structurally guaranteed to return exactly p_days rows: it selects
      // from generate_series(p_days) LEFT JOIN student_responses, and its WHERE clause names no
      // joined column, so no absence of responses can suppress the zero-filled date rows. That
      // makes the row-count assertion below free and non-vacuous, not fixture-dependent.
      const beforeActivity = await victimClient.rpc('get_daily_activity', {
        p_student_id: victimUserId,
        p_days: 7,
      })
      expect(beforeActivity.error).toBeNull()
      expect(beforeActivity.data).toHaveLength(7)

      // get_subject_scores, unlike its sibling above, aggregates real quiz_sessions rows, and the
      // seeded victim has no guaranteed scored session — so THIS result set may legitimately be
      // empty. LIMITATION stated rather than hidden: the assertion under test is the RAISE, which
      // an empty set cannot satisfy. Its PAYLOAD is pinned at the integration tier instead, in
      // packages/db/src/__integration__/rpc-analytics-guards.integration.test.ts, which seeds real
      // scored sessions and asserts the averages.
      const beforeScores = await victimClient.rpc('get_subject_scores', {
        p_student_id: victimUserId,
        p_limit: 5,
      })
      expect(beforeScores.error).toBeNull()
      expect(Array.isArray(beforeScores.data)).toBe(true)

      // Soft-delete the owner via admin. The JWT minted in beforeAll stays valid — nothing
      // revokes it — so the in-function gate is the only thing left in the way.
      const { data: deleted, error: delErr } = await admin
        .from('users')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', victimUserId)
        .is('deleted_at', null)
        .select('id')
      expect(delErr).toBeNull()
      expect((deleted ?? []).length).toBeGreaterThan(0)
      victimSoftDeleted = true

      const activity = await victimClient.rpc('get_daily_activity', {
        p_student_id: victimUserId,
        p_days: 7,
      })
      expect(activity.error).not.toBeNull()
      expect(activity.error?.message ?? '').toMatch(/user not found or inactive/i)
      expect(activity.data).toBeNull()

      const scores = await victimClient.rpc('get_subject_scores', {
        p_student_id: victimUserId,
        p_limit: 5,
      })
      expect(scores.error).not.toBeNull()
      expect(scores.error?.message ?? '').toMatch(/user not found or inactive/i)
      expect(scores.data).toBeNull()
    })
  })

  test.describe('FN: the identity guard rejects a cross-student read', () => {
    // Decision 24's identity guard, pre-existing and unchanged by mig 20260824000300, was
    // likewise covered only at the integration tier. Asserted here because it sits BEFORE the
    // active-user gate: if it regressed, the gate above would be measuring the wrong boundary.
    test('an active caller cannot read another student analytics', async () => {
      // Positive controls, and the reason this test is not vacuous: the SAME client must be able
      // to read its OWN analytics right here. Without them, a guard rewritten to raise 'forbidden'
      // unconditionally would still satisfy every assertion below — the §7 failure shape where a
      // second guard reaches the expected result first. ONE PER RPC is required, not one for the
      // pair: mig 20260824000300 gives each function its own independent identity guard (L68 and
      // L126), so a control calling only one of them leaves the other half vacuous.
      //
      // get_daily_activity zero-fills from generate_series(p_days), so its row count is
      // structural, not fixture-dependent.
      const ownActivity = await victimClient.rpc('get_daily_activity', {
        p_student_id: victimUserId,
        p_days: 7,
      })
      expect(ownActivity.error).toBeNull()
      expect(ownActivity.data).toHaveLength(7)

      // get_subject_scores aggregates real quiz_sessions rows, so the seeded victim may
      // legitimately have none — assert the SHAPE, not a count. The RAISE is what is under test,
      // and an empty set cannot satisfy it.
      const ownScores = await victimClient.rpc('get_subject_scores', {
        p_student_id: victimUserId,
        p_limit: 5,
      })
      expect(ownScores.error).toBeNull()
      expect(Array.isArray(ownScores.data)).toBe(true)

      const activity = await victimClient.rpc('get_daily_activity', {
        p_student_id: attackerUserId,
        p_days: 7,
      })
      expect(activity.error).not.toBeNull()
      expect(activity.error?.message ?? '').toMatch(/forbidden/i)
      expect(activity.data).toBeNull()

      const scores = await victimClient.rpc('get_subject_scores', {
        p_student_id: attackerUserId,
        p_limit: 5,
      })
      expect(scores.error).not.toBeNull()
      expect(scores.error?.message ?? '').toMatch(/forbidden/i)
      expect(scores.data).toBeNull()
    })
  })
})
