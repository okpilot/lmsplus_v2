/**
 * Red Team Spec 9 — Vector K (MEDIUM): Rapid-Fire Server Action Calls
 *
 * Attack: Fire 50 parallel requests to `start_quiz_session` as the same user.
 * Goal: Create a denial-of-service condition, exhaust connection pool resources,
 *       or bypass per-user session limits through concurrency.
 * Defense: Rate limiting (NOT YET IMPLEMENTED — see test.skip below).
 *
 * DOCUMENTED GAP: No rate limiting exists at the RPC, Server Action, or API
 * gateway layer. When rate limiting is added, remove the `test.skip` on the
 * main test and verify the throttle threshold.
 *
 * The observation test below runs unconditionally and documents the current
 * (unprotected) behaviour so we have a baseline when the fix lands.
 */

import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { ATTACKER_EMAIL, ATTACKER_PASSWORD, seedRedTeamUsers } from './helpers/seed'

test.describe('Red Team: Rate Limiting', () => {
  let attackerClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let subjectId: string

  test.beforeAll(async () => {
    await seedRedTeamUsers()
    attackerClient = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)

    const admin = getAdminClient()
    const { data: subject } = await admin.from('subjects').select('id').limit(1).single()
    subjectId = subject!.id
  })

  // ---------------------------------------------------------------------------
  // SKIPPED: Remove skip when rate limiting is implemented.
  // ---------------------------------------------------------------------------
  test.skip('rate limits rapid-fire RPC calls', async () => {
    // DOCUMENTED GAP: No rate limiting is implemented yet.
    // When rate limiting is added (e.g., via Supabase Edge Functions, an API
    // gateway, or a Next.js middleware token bucket), remove this skip and
    // verify that rapid-fire calls are throttled to an acceptable threshold.

    const results = await Promise.all(
      Array.from({ length: 50 }, () =>
        attackerClient.rpc('start_quiz_session', {
          p_subject_id: subjectId,
          p_question_count: 1,
        }),
      ),
    )

    const successes = results.filter((r) => !r.error).length

    // With rate limiting, the vast majority of rapid calls should be rejected.
    // A threshold of < 10 successes out of 50 is a reasonable starting target.
    expect(successes).toBeLessThan(10)
  })

  // ---------------------------------------------------------------------------
  // OBSERVATION: Documents current (unprotected) baseline behaviour.
  // This test passes because it asserts the ABSENCE of rate limiting.
  // It will need to be updated (or removed) when rate limiting ships.
  // ---------------------------------------------------------------------------
  test('observation: all 50 rapid-fire RPC calls succeed (no rate limiting)', async () => {
    // This test documents the current state: without rate limiting, every
    // parallel call to start_quiz_session succeeds, creating 50 sessions in
    // the database. When rate limiting is implemented this test should be
    // replaced by the skipped test above.

    const results = await Promise.all(
      Array.from({ length: 50 }, () =>
        attackerClient.rpc('start_quiz_session', {
          p_subject_id: subjectId,
          p_question_count: 1,
        }),
      ),
    )

    const successes = results.filter((r) => !r.error).length
    const failures = results.filter((r) => r.error).length

    // Log for visibility in CI reports
    console.log(`[rate-limiting] ${successes}/50 calls succeeded, ${failures} rejected`)

    // Current expectation: all succeed (no throttle)
    // Update this threshold when rate limiting is added.
    expect(successes).toBe(50)

    // Clean up: discard the 50 sessions we just created so the DB stays tidy
    const admin = getAdminClient()
    const sessionIds = results
      .filter((r) => !r.error && r.data)
      .map((r) => (r.data as { session_id: string }).session_id)

    if (sessionIds.length > 0) {
      await admin
        .from('quiz_sessions')
        .update({ status: 'discarded', deleted_at: new Date().toISOString() })
        .in('id', sessionIds)
    }
  })
})
