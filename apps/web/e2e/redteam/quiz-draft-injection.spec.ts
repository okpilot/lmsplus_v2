/**
 * Red Team Spec: Quiz Draft Question Injection
 *
 * Vector C (MEDIUM): A student from org A injects question IDs that belong to a
 * different organisation (org B) — attempting to reference questions they should
 * not have access to and load them via start_quiz_session.
 *
 * Defense under test: start_quiz_session (mig 20260521000001, lines 73-83)
 * validates every supplied question UUID against
 *   `q.organization_id = v_org_id`  (caller's own org)
 * and raises `invalid_question_ids` on any mismatch — so a cross-org caller
 * holding real question IDs from the victim's org is rejected at the session-start
 * boundary, not merely at draft-save time.
 *
 * Status: Expected to PASS (defenses should hold).
 * If any assertion fails, it indicates a cross-org question injection gap.
 */

import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import {
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  createCrossOrgUser,
  pickSubjectWithQuestions,
  seedRedTeamUsers,
  VICTIM_EMAIL,
  VICTIM_PASSWORD,
} from './helpers/seed'

test.describe('Red Team: Quiz Draft Question Injection', () => {
  let attackerClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let victimClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let crossOrgClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let adminClient: Awaited<ReturnType<typeof getAdminClient>>
  let attackerUserId: string
  let victimUserId: string
  /** IDs of active questions from egmont-aviation — foreign to the cross-org caller. */
  let foreignQuestionIds: string[]
  let orgId: string
  let foreignSubjectId: string
  let foreignTopicId: string

  test.beforeAll(async () => {
    const seed = await seedRedTeamUsers()
    orgId = seed.orgId
    attackerClient = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)
    victimClient = await createAuthenticatedClient(VICTIM_EMAIL, VICTIM_PASSWORD)
    adminClient = getAdminClient()

    const crossOrgUser = await createCrossOrgUser()
    crossOrgClient = await createAuthenticatedClient(crossOrgUser.email, crossOrgUser.password)

    const { data: me } = await attackerClient.auth.getUser()
    attackerUserId = me?.user?.id ?? ''
    expect(attackerUserId).not.toBe('')

    const { data: victimMe } = await victimClient.auth.getUser()
    victimUserId = victimMe?.user?.id ?? ''
    expect(victimUserId).not.toBe('')

    // Admin: resolve real question IDs from egmont-aviation (orgId).
    // These are genuinely foreign to the cross-org caller (who belongs to
    // redteam-other-org). Non-vacuity: we assert length > 0 below so that a
    // rejected session proves RLS/RPC org-scoping, not an empty question set.
    const picked = await pickSubjectWithQuestions(adminClient, { orgId })
    foreignSubjectId = picked.subjectId
    foreignTopicId = picked.topicId

    const { data: questions, error: questionsError } = await adminClient
      .from('questions')
      .select('id')
      .eq('organization_id', orgId)
      .eq('subject_id', foreignSubjectId)
      .eq('topic_id', foreignTopicId)
      .eq('status', 'active')
      .is('deleted_at', null)
      .limit(5)

    expect(questionsError).toBeNull()
    foreignQuestionIds = (questions ?? []).map((q) => q.id)

    // Non-vacuity guard (code-style.md §7): the foreign questions must exist so
    // that a downstream rejection proves the cross-org boundary, not an empty set.
    expect(
      foreignQuestionIds.length,
      'beforeAll: egmont-aviation must have ≥1 active question for the injection test to be non-vacuous',
    ).toBeGreaterThan(0)
  })

  // Hermetic cleanup (code-style.md §7): hard-delete any quiz_drafts created for
  // the victim user during this describe block. quiz_drafts has no deleted_at
  // column — it is ephemeral, hard-deleted by the app on submit/cancel (mig
  // 20260312000009), and has no FK children — so soft-delete is impossible and
  // hard-delete is the correct cleanup. Runs after every test so a mid-suite
  // failure doesn't leave state that breaks downstream specs.
  test.afterEach(async () => {
    if (!victimUserId) return
    const { data: discarded, error } = await adminClient
      .from('quiz_drafts')
      .delete()
      .eq('student_id', victimUserId)
      .select('id')
    if (error) {
      console.error('[quiz-draft-injection] afterEach cleanup error:', error.message)
    }
    if ((discarded?.length ?? 0) > 0) {
      console.log(`[quiz-draft-injection] afterEach: deleted ${discarded?.length} victim draft(s)`)
    }
  })

  test('cross-org caller is rejected by start_quiz_session when supplying foreign question IDs', async () => {
    // Attack: the cross-org caller (redteam-other-org) supplies valid egmont-aviation
    // question IDs to start_quiz_session. The RPC validates every UUID against
    //   q.organization_id = caller's org_id
    // (mig 20260521000001, lines 73-83). Since the caller's org is redteam-other-org
    // and these questions belong to egmont-aviation, the count check fails and the
    // RPC raises `invalid_question_ids`.
    const { data, error } = await crossOrgClient.rpc('start_quiz_session', {
      p_mode: 'quick_quiz',
      p_subject_id: foreignSubjectId,
      p_topic_id: foreignTopicId,
      p_question_ids: foreignQuestionIds,
    })

    expect(error, 'start_quiz_session must reject foreign-org question IDs').not.toBeNull()
    expect(error?.message ?? '').toMatch(/invalid_question_ids/i)
    expect(data ?? null).toBeNull()
  })

  test('attacker cannot insert a draft owned by another student (student_id forgery)', async () => {
    // Attack: spoof student_id to save a draft under the victim's account
    expect(victimUserId).not.toBe('')

    const { error } = await attackerClient.from('quiz_drafts').insert({
      student_id: victimUserId, // Forged: attacker pretends to be victim
      organization_id: orgId,
      question_ids: foreignQuestionIds,
      answers: {},
    })

    // RLS must reject: student_id in the row must match auth.uid()
    expect(error).not.toBeNull()
  })

  test("attacker cannot read another student's quiz drafts", async () => {
    // First, create a legitimate draft as the victim (cleaned up by afterEach)
    await adminClient.from('quiz_drafts').insert({
      student_id: victimUserId,
      organization_id: orgId,
      question_ids: [],
      answers: {},
    })

    // Attacker attempts to read all drafts — must only see their own
    const { data: drafts, error } = await attackerClient
      .from('quiz_drafts')
      .select('id, student_id')
      .limit(20)

    expect(error).toBeNull()

    if (drafts && drafts.length > 0) {
      for (const draft of drafts) {
        expect(draft.student_id).toBe(attackerUserId)
      }
    }
  })

  test("attacker cannot update another student's quiz draft", async () => {
    // Find a draft belonging to the victim (created in the preceding test,
    // or seed one here if none exists — afterEach cleans up both).
    if (!victimUserId) return

    const { data: victimDrafts } = await adminClient
      .from('quiz_drafts')
      .select('id')
      .eq('student_id', victimUserId)
      .limit(1)

    if (!victimDrafts || victimDrafts.length === 0) {
      // No victim draft to target — pass (nothing to exploit)
      return
    }

    const victimDraftId = victimDrafts[0].id

    await attackerClient
      .from('quiz_drafts')
      .update({ question_ids: foreignQuestionIds })
      .eq('id', victimDraftId)

    // RLS silently filters zero-row UPDATEs (error is null).
    // Verify the victim's draft was NOT modified.
    const { data: afterUpdate } = await adminClient
      .from('quiz_drafts')
      .select('question_ids')
      .eq('id', victimDraftId)
      .single()

    // question_ids must be unchanged (empty array from original insert)
    expect(afterUpdate?.question_ids).toEqual([])
  })

  test('advisory lock serializes concurrent draft inserts so the 20-draft cap cannot be exceeded (Vector BI — draft-limit TOCTOU)', async () => {
    // Vector BI: a student fires N concurrent INSERT requests hoping the
    // read-then-write gap lets multiple inserts slip through the trigger's
    // count >= 20 guard simultaneously.
    //
    // Defense under test: enforce_draft_limit trigger (mig 20260430000011)
    //   pg_advisory_xact_lock(hashtext(student_id)) serializes concurrent inserts
    //   per student, so only one can proceed once count reaches 20.
    //
    // Non-vacuity (code-style.md §7): we pre-seed exactly 19 drafts via the
    // admin client so the victim is one below the cap. That way "0 concurrent
    // inserts succeeded" would reveal a broken trigger, not an already-at-cap
    // pre-condition.

    // Deterministic pre-condition: hard-delete any victim drafts left over from a
    // prior test whose afterEach failed, so the 19-row seed below starts clean and
    // the pre-burst count is exactly 19 (not 20+ from inherited state).
    const { data: preDiscarded, error: preCleanError } = await adminClient
      .from('quiz_drafts')
      .delete()
      .eq('student_id', victimUserId)
      .select('id')
    expect(preCleanError, 'pre-seed cleanup of stale victim drafts must succeed').toBeNull()
    if ((preDiscarded?.length ?? 0) > 0) {
      console.log(
        `[quiz-draft-injection] pre-seed cleanup: deleted ${preDiscarded?.length} stale draft(s)`,
      )
    }

    // --- Step 1: Seed exactly 19 drafts as the victim via the admin client ---
    const seedRows = Array.from({ length: 19 }, () => ({
      student_id: victimUserId,
      organization_id: orgId,
      question_ids: [] as string[],
      answers: {} as Record<string, never>,
    }))
    const { error: seedError } = await adminClient.from('quiz_drafts').insert(seedRows)
    expect(seedError, 'admin seed of 19 drafts must succeed').toBeNull()

    // Non-vacuity guard: confirm pre-burst count is exactly 19.
    // No deleted_at filter here — this query mirrors exactly what the cap trigger
    // counts (`SELECT count(*) FROM quiz_drafts WHERE student_id = ?`, mig
    // 20260430000011). If a future migration adds soft-delete to quiz_drafts and
    // the trigger's count gains a filter, this query must gain the same filter.
    const { data: preBurstRows, error: preBurstError } = await adminClient
      .from('quiz_drafts')
      .select('id')
      .eq('student_id', victimUserId)
    expect(preBurstError).toBeNull()
    expect(
      preBurstRows?.length,
      'pre-burst: victim must have exactly 19 active drafts for the TOCTOU test to be non-vacuous',
    ).toBe(19)

    // --- Step 2: Fire 5 concurrent inserts via the victim's authenticated client ---
    const burstResults = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        victimClient.from('quiz_drafts').insert({
          student_id: victimUserId,
          organization_id: orgId,
          question_ids: [] as string[],
          answers: {} as Record<string, never>,
        }),
      ),
    )

    // --- Step 3: Exactly 1 must succeed; 4 must be rejected with the cap message ---
    const successes = burstResults.filter((r) => r.status === 'fulfilled' && r.value.error === null)
    const capRejections = burstResults.filter(
      (r) =>
        r.status === 'fulfilled' &&
        r.value.error !== null &&
        /maximum 20 saved quizzes reached/i.test(r.value.error?.message ?? ''),
    )

    expect(
      successes.length,
      'exactly 1 concurrent insert must succeed (advisory lock allows only one at the boundary)',
    ).toBe(1)
    expect(
      capRejections.length,
      'the remaining 4 concurrent inserts must be rejected with the 20-draft cap message',
    ).toBe(4)

    // --- Step 4: Post-burst count must be exactly 20 (delta = 1) ---
    const { data: postBurstRows, error: postBurstError } = await adminClient
      .from('quiz_drafts')
      .select('id')
      .eq('student_id', victimUserId)
    expect(postBurstError).toBeNull()
    expect(
      postBurstRows?.length,
      'post-burst: advisory lock must hold the count at exactly 20 (delta = 1 from 19)',
    ).toBe(20)
  })
})
