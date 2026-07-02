/**
 * Red Team Spec 9 — Vector K (MEDIUM): Rapid-Fire Server Action Calls
 *
 * Attack: Fire 50 parallel RPC requests as the same user.
 * Goal: Create a denial-of-service condition, exhaust connection pool resources,
 *       or bypass per-user limits through concurrency.
 * Defense: Rate limiting (NOT YET IMPLEMENTED — see test.skip below).
 *
 * DOCUMENTED GAP: No rate limiting exists at the RPC, Server Action, or API
 * gateway layer. When rate limiting is added, remove the `test.skip` on the
 * main test and verify the throttle threshold.
 *
 * The observation test below runs unconditionally and documents the current
 * (unprotected) behaviour so we have a baseline when the fix lands.
 *
 * RPC choice (#1011): the rapid-fire probe uses the read-only `get_quiz_questions`
 * RPC, NOT `start_quiz_session`. The single-active-session invariant (mig 136)
 * caps a student at one active session, so 50 parallel `start_quiz_session` calls
 * could never all succeed regardless of throttling — that would conflate the
 * invariant with rate limiting. A stateless read fired 50× in parallel isolates
 * the property under test: whether the layer throttles rapid concurrent calls.
 */

import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { pickSubjectWithQuestions } from './helpers/seed-quiz'
import { ATTACKER_EMAIL, ATTACKER_PASSWORD, seedRedTeamUsers } from './helpers/seed-users'

test.describe('Red Team: Rate Limiting', () => {
  let attackerClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let attackerUserId: string
  let subjectId: string
  let questionIds: string[]
  let topicId: string

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

  // ---------------------------------------------------------------------------
  // SKIPPED: Remove skip when rate limiting is implemented.
  // ---------------------------------------------------------------------------
  test.skip('rate limits rapid-fire RPC calls', async () => {
    // DOCUMENTED GAP: No rate limiting is implemented yet.
    // When rate limiting is added (e.g., via Supabase Edge Functions, an API
    // gateway, or a Next.js middleware token bucket), remove this skip and
    // verify that rapid-fire calls are throttled to an acceptable threshold.
    //
    // Read-only RPC (#1011): see the header note — a stateless read isolates
    // throttling from the single-active-session invariant.
    const results = await Promise.all(
      Array.from({ length: 50 }, () =>
        attackerClient.rpc('get_quiz_questions', { p_question_ids: questionIds }),
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
    // parallel read RPC call succeeds. A read-only RPC (get_quiz_questions) is
    // used so the probe measures throttling, not the single-active-session
    // invariant (#1011) — which would cap 50 parallel start_quiz_session calls
    // at one success regardless of rate limiting. No quiz_sessions rows are
    // created, so no cleanup is needed. When rate limiting is implemented this
    // test should be replaced by the skipped test above.
    const results = await Promise.all(
      Array.from({ length: 50 }, () =>
        attackerClient.rpc('get_quiz_questions', { p_question_ids: questionIds }),
      ),
    )

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
  // This test documents the observable contract:
  //   1. A record_login burst ALL succeeds (the dedup is a silent no-op, no error).
  //   2. AT MOST one new audit row is inserted per 60s window, regardless of size.
  //
  // Hermiticity note: audit_events is immutable (security.md rule 5 — no
  // UPDATE/DELETE). Cleanup is not possible and not needed. The delta is scoped
  // to rows created since burstStart for this user, so the assertion is safe to
  // re-run: if the 60s window was already open the delta is 0, if it was clean it
  // is 1 — never the full burst size. Both outcomes prove the dedup fired.
  // ---------------------------------------------------------------------------

  test('observation: a record_login burst never errors and collapses to at most one audit row (60s dedup)', async () => {
    // Vector W — calls are fired SEQUENTIALLY on purpose. record_login is
    // check-then-insert with no unique constraint, so a truly parallel burst
    // could let several calls pass the EXISTS guard before any INSERT commits
    // (TOCTOU → >1 row). Sequential calls make the guard deterministic: once the
    // first row exists, every later call within 60s sees it and no-ops. The
    // observable contract is "at most one new row per 60s window".
    //
    // Non-vacuity (code-style.md §7): snapshot the count BEFORE the burst so the
    // delta proves how many rows the burst actually wrote (0 if the window was
    // already open for this user, 1 if it was clean) — never the full burst size.
    const admin = getAdminClient()
    const burstStart = new Date().toISOString()

    const { data: preBurst, error: preError } = await admin
      .from('audit_events')
      .select('id')
      .eq('event_type', 'student.login')
      .eq('actor_id', attackerUserId)
      .gte('created_at', burstStart)
    if (preError) throw new Error(`[rate-limiting] pre-burst audit query: ${preError.message}`)
    const preCount = preBurst?.length ?? 0

    // Fire the burst sequentially; the rate-limit is a no-op, never a rejection.
    const errors: string[] = []
    for (let i = 0; i < 10; i++) {
      const { error } = await attackerClient.rpc('record_login')
      if (error) errors.push(error.message)
    }
    if (errors.length > 0) {
      console.error('[rate-limiting] record_login burst errors:', errors)
    }
    expect(errors).toHaveLength(0)

    const { data: postBurst, error: postError } = await admin
      .from('audit_events')
      .select('id')
      .eq('event_type', 'student.login')
      .eq('actor_id', attackerUserId)
      .gte('created_at', burstStart)
    if (postError) throw new Error(`[rate-limiting] post-burst audit query: ${postError.message}`)
    const delta = (postBurst?.length ?? 0) - preCount

    console.log(`[rate-limiting] record_login burst: preCount=${preCount}, delta=${delta}`)

    // The 60s dedup window collapses 10 calls to AT MOST one new row.
    // (Migration 20260319000047 — latest record_login def: line 40 inserts
    //  event_type 'student.login'; the dedup guard at lines 31-32 skips when a
    //  'student.login' row already exists within now() - interval '60 seconds'.)
    expect(delta).toBeGreaterThanOrEqual(0)
    expect(delta).toBeLessThanOrEqual(1)
  })
})
