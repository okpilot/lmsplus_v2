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
import {
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  pickSubjectWithQuestions,
  seedRedTeamUsers,
} from './helpers/seed'

test.describe('Red Team: Rate Limiting', () => {
  let attackerClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let attackerUserId: string
  let subjectId: string
  let questionIds: string[]
  let topicId: string
  // Track every quiz_session this spec creates so afterEach can soft-delete
  // them even if assertions fail mid-test (per code-style.md §7 hermiticity).
  const createdSessionIds: string[] = []

  test.beforeAll(async () => {
    const { orgId, attackerUserId: uid } = await seedRedTeamUsers()
    attackerUserId = uid
    attackerClient = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)

    const admin = getAdminClient()
    const picked = await pickSubjectWithQuestions(admin, { orgId })
    subjectId = picked.subjectId
    topicId = picked.topicId

    const { data: qs } = await admin
      .from('questions')
      .select('id')
      .eq('organization_id', orgId)
      .eq('subject_id', subjectId)
      .eq('topic_id', topicId)
      .eq('status', 'active')
      .is('deleted_at', null)
      .limit(1)
    questionIds = (qs ?? []).map((q) => q.id)
  })

  test.afterEach(async () => {
    if (createdSessionIds.length === 0) return
    const admin = getAdminClient()
    const { data, error } = await admin
      .from('quiz_sessions')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', createdSessionIds)
      .select('id')
    if (error) console.error('[rate-limiting afterEach] cleanup error:', error.message)
    if ((data?.length ?? 0) > 0)
      console.log(`[rate-limiting afterEach] soft-deleted ${data?.length} session(s)`)
    createdSessionIds.length = 0
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
          p_mode: 'quick_quiz',
          p_subject_id: subjectId,
          p_topic_id: topicId,
          p_question_ids: questionIds,
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
          p_mode: 'quick_quiz',
          p_subject_id: subjectId,
          p_topic_id: topicId,
          p_question_ids: questionIds,
        }),
      ),
    )

    // Collect created session IDs BEFORE any assertion so afterEach cleans
    // up even if the expectation below fails (hermiticity rule).
    for (const r of results) {
      if (!r.error && r.data) createdSessionIds.push(r.data as string)
    }

    const successes = results.filter((r) => !r.error).length
    const failures = results.filter((r) => r.error).length

    // Log for visibility in CI reports
    console.log(`[rate-limiting] ${successes}/50 calls succeeded, ${failures} rejected`)

    // Current expectation: all succeed (no throttle)
    // Update this threshold when rate limiting is added.
    expect(successes).toBe(50)
  })

  // ---------------------------------------------------------------------------
  // Vector W (MEDIUM): record_login 60-second rate-limit observation.
  // GitHub issue #298.
  //
  // record_login() (migration 20260319000047) implements a 60-second dedup
  // window: if a 'student.login' audit_events row already exists for the caller
  // within the last 60 seconds, the RPC returns immediately without inserting.
  // The rate-limit is a silent no-op — it never returns an error.
  //
  // These tests document the observable contract:
  //   1. A burst of 10 parallel calls ALL succeed (no error is returned).
  //   2. Exactly ONE new audit row is inserted regardless of burst size.
  //
  // Hermiticity note: audit_events is immutable (security.md rule 5 — no
  // UPDATE/DELETE). Cleanup is not possible and not needed. The delta assertion
  // (count after minus count before == 1) scopes the assertion to rows produced
  // by this burst, making the test safe to re-run within the same 60s window:
  // if the window is already open the delta is 0 (rate-limit fires on all 10),
  // not 1 — the test will correctly fail in that edge case, signalling the
  // constraint was not exercised. In practice Playwright's redteam project runs
  // serially and these two tests run back-to-back; only the first call in the
  // burst opens the window, so the delta is always exactly 1 under normal CI.
  // ---------------------------------------------------------------------------

  test('observation: all 10 burst record_login calls return no error (rate-limit is a silent no-op)', async () => {
    // Vector W — assert the rate-limit NEVER returns an error on any of the 10
    // parallel calls. The first call writes the row; the remaining 9 hit the
    // 60s window guard and return void without inserting — silently, not with
    // an error.
    const results = await Promise.all(
      Array.from({ length: 10 }, () => attackerClient.rpc('record_login')),
    )

    const errors = results.filter((r) => r.error)
    if (errors.length > 0) {
      console.error(
        '[rate-limiting] record_login errors:',
        errors.map((r) => r.error?.message),
      )
    }

    // All 10 calls must return without an error (rate-limit is a no-op, not a
    // rejection).
    expect(errors).toHaveLength(0)
  })

  test('observation: burst of 10 record_login calls produces exactly 1 new audit row (60s dedup window)', async () => {
    // Vector W — assert the 60-second rate-limit collapses the burst to exactly
    // one 'student.login' audit_events row.
    //
    // Non-vacuity (code-style.md §7): we snapshot the count BEFORE the burst so
    // the delta assertion proves a row was actually written — not just that zero
    // rows exist (which would be vacuously true if the user had no prior rows).

    const admin = getAdminClient()
    const burstStart = new Date().toISOString()

    // Pre-burst baseline: count existing student.login rows for this user
    // created since burstStart (should be 0 at this instant).
    const { data: preBurst, error: preError } = await admin
      .from('audit_events')
      .select('id')
      .eq('event_type', 'student.login')
      .eq('actor_id', attackerUserId)
      .gte('created_at', burstStart)
    if (preError) throw new Error(`[rate-limiting] pre-burst audit query: ${preError.message}`)
    const preCount = preBurst?.length ?? 0

    // Fire the burst (10 parallel calls).
    const results = await Promise.all(
      Array.from({ length: 10 }, () => attackerClient.rpc('record_login')),
    )
    const errors = results.filter((r) => r.error)
    if (errors.length > 0) {
      console.error(
        '[rate-limiting] record_login burst errors:',
        errors.map((r) => r.error?.message),
      )
    }

    // Post-burst count: rows written after burstStart.
    const { data: postBurst, error: postError } = await admin
      .from('audit_events')
      .select('id')
      .eq('event_type', 'student.login')
      .eq('actor_id', attackerUserId)
      .gte('created_at', burstStart)
    if (postError) throw new Error(`[rate-limiting] post-burst audit query: ${postError.message}`)
    const postCount = postBurst?.length ?? 0

    console.log(
      `[rate-limiting] record_login burst: preCount=${preCount}, postCount=${postCount}, delta=${postCount - preCount}`,
    )

    // The delta must be exactly 1: the first call in the burst wrote one row;
    // the remaining 9 hit the 60s window guard and returned void.
    // (Migration 20260319000047 — latest record_login def: line 40 inserts
    //  event_type 'student.login'; the dedup guard at lines 31-32 skips when a
    //  'student.login' row already exists within now() - interval '60 seconds'.)
    expect(postCount - preCount).toBe(1)
  })
})
