/**
 * Red Team Spec: start_quiz_session Input Smuggling — Vector CU (issue #625)
 *
 * Attack:  An authenticated student calls `start_quiz_session` with
 *          `p_question_ids` that contain UUIDs the RPC should reject:
 *
 *   Sub-vector 1 — Cross-org question IDs:
 *     The attacker is a user in `redteam-other-org` (created via
 *     createCrossOrgUser()). They pass valid question UUIDs that belong to
 *     `egmont-aviation` (org A). The RPC resolves `v_org_id` from
 *     `auth.uid()` → redteam-other-org (org B). The guard at line 75 of
 *     mig 20260521000001 enforces `q.organization_id = v_org_id`; since
 *     the questions exist in egmont (org A) but the caller's org is
 *     redteam-other-org (org B), the COUNT check fails and the RPC raises
 *     `invalid_question_ids`. This proves the org boundary filter, not
 *     merely "non-existent UUID rejected".
 *
 *   Sub-vector 2 — Soft-deleted question IDs (same org):
 *     The attacker passes UUIDs of questions whose `deleted_at IS NOT NULL`.
 *     Before the fix, a soft-deleted question still matched on the plain
 *     UUID JOIN; the guard also requires `q.deleted_at IS NULL`.
 *
 * Goal:    Start a quiz session with smuggled IDs to gain unauthorized access
 *          to foreign-org content or to revive soft-deleted questions into a
 *          live scoring session.
 *
 * Defense: Migration 20260521000001 (`start_quiz_session_null_guard`).
 *          After the active-user gate, the RPC runs a COUNT(*)
 *          JOIN that enforces: `q.organization_id = v_org_id`,
 *          `q.status = 'active'`, and `q.deleted_at IS NULL`.
 *          Any count mismatch raises `invalid_question_ids` (line 82).
 *          The org filter (`q.organization_id = v_org_id`) is at line 75.
 *
 * Non-vacuity (§7 red-team isolation rule):
 *   Attack 1: egmont question IDs are confirmed non-empty via admin query
 *     before the RPC call — a HARD-FAIL guard throws if egmont has no
 *     active questions, so a zero-length smuggle set can never pass vacuously.
 *   Attack 2: the soft-deleted question is confirmed via admin read before
 *     the RPC call, and afterEach verifies exactly one row was actually deleted.
 *
 * Hermetic cleanup:
 *   - Soft-deleted questions are restored in afterEach (nulling deleted_at).
 *   - Created quiz_sessions (if any — should be zero because both tests
 *     expect a raised error before INSERT) are soft-deleted in afterEach
 *     scoped to the respective caller + test-window timestamp.
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
} from './helpers/seed'

test.describe('Vector CU — start_quiz_session question-ID smuggling (issue #625)', () => {
  let admin: ReturnType<typeof getAdminClient>
  let attackerClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let crossOrgClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let attackerUserId: string
  let crossOrgUserId: string
  let egmontOrgId: string

  // Egmont question IDs used as the cross-org smuggle payload (Attack 1).
  // These exist in egmont (org A) but the cross-org caller is in
  // redteam-other-org (org B), so the org filter rejects them.
  let egmontQuestionIds: string[]
  // egmont subject/topic used for Attack 1's p_subject_id / p_topic_id params.
  let egmontSubjectId: string
  let egmontTopicId: string

  // Valid same-org context so p_mode / p_subject_id / p_topic_id are
  // syntactically correct — the only invalid part is p_question_ids (Attack 2).
  let validSubjectId: string
  let validTopicId: string

  // Restored in afterEach for sub-vector 2 (soft-deleted question test).
  let borrowedQuestionId: string | null = null
  // Timestamp recorded per-test for the no-INSERT positive assertion.
  let testStartIso: string

  test.beforeAll(async () => {
    admin = getAdminClient()
    const seed = await seedRedTeamUsers()
    egmontOrgId = seed.orgId
    attackerClient = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)

    const { data: me } = await attackerClient.auth.getUser()
    attackerUserId = me?.user?.id ?? ''
    if (!attackerUserId)
      throw new Error('rpc-start-session-smuggling: could not resolve attacker id')

    // Attack 1: create a caller in redteam-other-org (the cross-org boundary).
    const crossOrgUser = await createCrossOrgUser()
    crossOrgClient = await createAuthenticatedClient(crossOrgUser.email, crossOrgUser.password)
    crossOrgUserId = crossOrgUser.userId

    // Fetch real active egmont question IDs to use as the Attack 1 smuggle payload.
    // These questions exist in egmont-aviation (org A). The cross-org caller's
    // v_org_id resolves to redteam-other-org (org B) from auth.uid(), so
    // `q.organization_id = v_org_id` (mig 20260521000001 line 75) fails → invalid_question_ids.
    const egmontPicked = await pickSubjectWithQuestions(admin, {
      orgId: egmontOrgId,
      minActiveQuestions: 1,
      topicMinQuestions: 1,
    })
    egmontSubjectId = egmontPicked.subjectId
    egmontTopicId = egmontPicked.topicId

    const { data: egmontQs, error: egmontQErr } = await admin
      .from('questions')
      .select('id')
      .eq('organization_id', egmontOrgId)
      .eq('subject_id', egmontSubjectId)
      .eq('topic_id', egmontTopicId)
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('id', { ascending: true })
      .limit(1)
    if (egmontQErr) {
      throw new Error(
        `rpc-start-session-smuggling beforeAll: egmont question query failed: ${egmontQErr.message}`,
      )
    }

    // Non-vacuity guard (code-style.md §7): egmont MUST have ≥1 active question
    // so that rejection of these IDs proves the org boundary, not an empty set.
    expect(
      (egmontQs ?? []).length,
      'beforeAll: egmont-aviation must have ≥1 active question for Attack 1 to be non-vacuous',
    ).toBeGreaterThan(0)

    egmontQuestionIds = (egmontQs ?? []).map((q) => q.id)

    // Attack 2 uses a valid egmont-attacker context (not cross-org).
    const picked = await pickSubjectWithQuestions(admin, {
      orgId: egmontOrgId,
      minActiveQuestions: 1,
      topicMinQuestions: 1,
    })
    validSubjectId = picked.subjectId
    validTopicId = picked.topicId
  })

  test.beforeEach(async () => {
    borrowedQuestionId = null
    testStartIso = new Date().toISOString()
  })

  test.afterEach(async () => {
    // Restore a soft-deleted egmont question (sub-vector 2 only).
    if (borrowedQuestionId) {
      const { data: restored, error: restoreError } = await admin
        .from('questions')
        .update({ deleted_at: null })
        .eq('id', borrowedQuestionId)
        .select('id')
      if (restoreError) {
        console.error(
          '[rpc-start-session-smuggling afterEach] question restore failed:',
          restoreError.message,
        )
      } else if ((restored?.length ?? 0) > 0) {
        console.log(
          `[rpc-start-session-smuggling afterEach] restored question ${borrowedQuestionId}`,
        )
      }
      borrowedQuestionId = null
    }

    // Positive no-INSERT assertion for the egmont attacker (Attack 2): the RPC
    // must raise before any row is written.
    const { data: leaked, error: cleanupError } = await admin
      .from('quiz_sessions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('student_id', attackerUserId)
      .gte('created_at', testStartIso)
      .is('deleted_at', null)
      .select('id')
    if (cleanupError) {
      console.error(
        '[rpc-start-session-smuggling afterEach] session cleanup (attacker) failed:',
        cleanupError.message,
      )
    }
    if ((leaked?.length ?? 0) > 0) {
      console.warn(
        `[rpc-start-session-smuggling afterEach] WARNING: ${leaked?.length} attacker session(s) were created despite expected rejection — regression detected`,
      )
    }

    // Positive no-INSERT assertion for the cross-org user (Attack 1).
    if (crossOrgUserId) {
      const { data: crossLeaked, error: crossCleanupError } = await admin
        .from('quiz_sessions')
        .update({ deleted_at: new Date().toISOString() })
        .eq('student_id', crossOrgUserId)
        .gte('created_at', testStartIso)
        .is('deleted_at', null)
        .select('id')
      if (crossCleanupError) {
        console.error(
          '[rpc-start-session-smuggling afterEach] session cleanup (cross-org) failed:',
          crossCleanupError.message,
        )
      }
      if ((crossLeaked?.length ?? 0) > 0) {
        console.warn(
          `[rpc-start-session-smuggling afterEach] WARNING: ${crossLeaked?.length} cross-org session(s) were created despite expected rejection — regression detected`,
        )
      }
    }
  })

  // -------------------------------------------------------------------------
  // Sub-vector 1 — cross-org question IDs
  // -------------------------------------------------------------------------
  test('Attack 1 — cross-org question IDs are rejected with invalid_question_ids', async () => {
    // The cross-org caller (redteam-other-org) supplies valid egmont-aviation
    // question IDs to start_quiz_session. The RPC resolves v_org_id from
    // auth.uid() → redteam-other-org. The guard at mig 20260521000001 line 75
    //   WHERE q.organization_id = v_org_id
    // means these egmont questions (org A) do not match the caller's org (org B),
    // so COUNT < array_length → RAISE EXCEPTION 'invalid_question_ids' (line 82).
    //
    // Non-vacuity: egmontQuestionIds is asserted non-empty in beforeAll, so
    // rejection here proves the org boundary filter, not "empty array rejected".
    const { data, error } = await crossOrgClient.rpc('start_quiz_session', {
      p_mode: 'quick_quiz',
      p_subject_id: egmontSubjectId,
      p_topic_id: egmontTopicId,
      p_question_ids: egmontQuestionIds,
    })

    // Defense asserted: RPC raised before any INSERT.
    expect(error, 'start_quiz_session must reject foreign-org question IDs').not.toBeNull()
    expect(error?.message ?? '').toMatch(/invalid_question_ids/i)
    expect(data ?? null).toBeNull()
  })

  // -------------------------------------------------------------------------
  // Sub-vector 2 — soft-deleted question IDs (same org)
  // -------------------------------------------------------------------------
  test('Attack 2 — soft-deleted question IDs are rejected with invalid_question_ids', async () => {
    // Borrow an active egmont question and soft-delete it temporarily.
    // Using a real egmont question (not a sentinel UUID) proves the guard
    // inspects deleted_at, not just UUID existence — non-vacuous per §7.
    const { data: candidates, error: candErr } = await admin
      .from('questions')
      .select('id')
      .eq('organization_id', egmontOrgId)
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('id', { ascending: true })
      .limit(1)
    if (candErr) {
      throw new Error(
        `rpc-start-session-smuggling Attack 2: question candidates query failed: ${candErr.message}`,
      )
    }
    if (!candidates || candidates.length === 0) {
      throw new Error(
        'rpc-start-session-smuggling Attack 2: no active egmont questions found — fixture prerequisite not met',
      )
    }

    const targetId = candidates[0].id
    borrowedQuestionId = targetId // recorded so afterEach restores it

    // Soft-delete the question (service-role bypasses the trigger).
    const { data: delData, error: delErr } = await admin
      .from('questions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', targetId)
      .select('id')
    expect(delErr).toBeNull()
    // Non-vacuity (§7): the soft-delete must hit exactly this row so the
    // subsequent rejection proves the guard, not an empty-set no-op.
    expect(delData?.length).toBe(1)

    // Confirm the row is now soft-deleted (admin read, bypasses RLS).
    const { data: verifyRow, error: verifyErr } = await admin
      .from('questions')
      .select('id, deleted_at')
      .eq('id', targetId)
      .single()
    expect(verifyErr).toBeNull()
    expect(verifyRow?.deleted_at).not.toBeNull()

    // Attack: attacker calls start_quiz_session with the soft-deleted UUID.
    // The question is in the attacker's own org and was active a moment ago —
    // the only reason for rejection must be the deleted_at IS NULL guard.
    const { data, error } = await attackerClient.rpc('start_quiz_session', {
      p_mode: 'quick_quiz',
      p_subject_id: validSubjectId,
      p_topic_id: validTopicId,
      p_question_ids: [targetId],
    })

    // Defense asserted: RPC raised before any INSERT.
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toContain('invalid_question_ids')
    expect(data ?? null).toBeNull()
  })
})
