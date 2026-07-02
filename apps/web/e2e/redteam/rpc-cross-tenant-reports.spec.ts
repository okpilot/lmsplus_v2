/**
 * Red Team Spec: Cross-Tenant RPC Isolation — seeding tests
 *
 * This file covers the 6 tests that seed fixture rows to prove cross-tenant
 * isolation non-vacuously. Probe-only tests (no seeding) live in
 * rpc-cross-tenant-isolation.spec.ts.
 *
 * Vectors: BY (list_my_active_internal_exam_codes + list_my_internal_exam_history),
 * BE (org-transfer cross-org session isolation), flagged_questions isolation,
 * user_consents isolation, CL3 get_session_reports IDOR.
 *
 * Status: Expected to PASS (defenses should hold).
 * If any assertion fails, it indicates an RLS gap requiring immediate fix.
 */

import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
import { cleanupFixtures, createFixtureTracker } from './helpers/cleanup'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { E2E_REDTEAM_CODE_PREFIX } from './helpers/seed-markers'
import { ensureExamConfig, pickSubjectWithQuestions } from './helpers/seed-quiz'
import {
  createCrossOrgUser,
  seedRedTeamUsers,
  VICTIM_EMAIL,
  VICTIM_PASSWORD,
} from './helpers/seed-users'

test.describe('Red Team: Cross-Tenant RPC Isolation — Reports and Seeding Tests', () => {
  let crossOrgClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let adminClient: Awaited<ReturnType<typeof getAdminClient>>
  let egmontVictimUserId: string
  let victimUserId: string
  let egmontOrgId: string
  let otherOrgId: string
  // A subject GUARANTEED to have egmont questions + an enabled exam_config.
  let examSubjectId: string
  let examTopicId: string
  let egmontQuestionIds: string[]

  // ≤20 chars: user_consents.document_version CHECK (char_length BETWEEN 1 AND 20)
  const RPC_CROSS_TENANT_CONSENT_VERSION = 'rct-x-1.0'

  // Fixture tracker for afterAll cleanup (sessions, codes, flags, consents).
  const tracker = createFixtureTracker()
  // Track seeded consent ID separately since we need to store it individually.
  let seededVictimConsentId: string | null = null

  test.beforeAll(async () => {
    const seed = await seedRedTeamUsers()
    egmontVictimUserId = seed.victimUserId
    victimUserId = seed.victimUserId
    egmontOrgId = seed.orgId
    otherOrgId = seed.otherOrgId
    const crossOrgUser = await createCrossOrgUser()
    crossOrgClient = await createAuthenticatedClient(crossOrgUser.email, crossOrgUser.password)
    adminClient = getAdminClient()

    // Resolve an egmont subject that definitely has active questions.
    const examPick = await pickSubjectWithQuestions(adminClient, { orgId: egmontOrgId })
    examSubjectId = examPick.subjectId
    examTopicId = examPick.topicId
    await ensureExamConfig(egmontOrgId, examSubjectId, examTopicId)

    const { data: qs, error: qErr } = await adminClient
      .from('questions')
      .select('id')
      .eq('organization_id', egmontOrgId)
      .eq('subject_id', examSubjectId)
      .eq('topic_id', examTopicId)
      .eq('status', 'active')
      .is('deleted_at', null)
      .limit(5)
    expect(qErr).toBeNull()
    egmontQuestionIds = (qs ?? []).map((q) => q.id)
    expect(egmontQuestionIds.length).toBeGreaterThan(0)
  })

  test('list_my_active_internal_exam_codes excludes other-student rows for the calling student (Vector BY)', async () => {
    // Seed an active internal_exam code owned by the egmont victim, then call
    // the RPC as the cross-org user. The RPC filters via
    // `WHERE iec.student_id = auth.uid()`, so the victim's code must never
    // appear in the cross-org caller's result.
    const { subjectId } = await pickSubjectWithQuestions(adminClient, { orgId: egmontOrgId })
    const victimCodeText = `${E2E_REDTEAM_CODE_PREFIX}${Date.now().toString(36).toUpperCase().slice(-6)}V`
    const { data: codeRow, error: codeErr } = await adminClient
      .from('internal_exam_codes')
      .insert({
        code: victimCodeText,
        subject_id: subjectId,
        student_id: egmontVictimUserId,
        issued_by: egmontVictimUserId,
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        organization_id: egmontOrgId,
      })
      .select('id')
      .single()
    if (codeErr || !codeRow) throw new Error(`seed victim code: ${codeErr?.message}`)
    tracker.codes.add(codeRow.id)

    const { data, error } = await crossOrgClient.rpc('list_my_active_internal_exam_codes')
    expect(error).toBeNull()
    const rows = (data ?? []) as Array<{ id: string }>
    expect(rows.find((r) => r.id === codeRow.id)).toBeUndefined()
  })

  test('list_my_internal_exam_history excludes other-student sessions for the calling student (Vector BY)', async () => {
    // Seed a finished internal_exam quiz_session owned by the egmont victim,
    // then call the RPC as the cross-org user. The RPC filters via
    // `WHERE qs.student_id = v_user_id AND qs.mode = 'internal_exam'`, so the
    // victim's session must never appear in the cross-org caller's history.
    const { subjectId } = await pickSubjectWithQuestions(adminClient, { orgId: egmontOrgId })
    const startedAt = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    const endedAt = new Date(Date.now() - 15 * 60 * 1000).toISOString()
    const { data: sessionRow, error: sessionErr } = await adminClient
      .from('quiz_sessions')
      .insert({
        organization_id: egmontOrgId,
        student_id: egmontVictimUserId,
        mode: 'internal_exam',
        subject_id: subjectId,
        config: { question_ids: [], pass_mark: 75 },
        total_questions: 1,
        time_limit_seconds: 600,
        started_at: startedAt,
        ended_at: endedAt,
        score_percentage: 100,
        passed: true,
        correct_count: 1,
      })
      .select('id')
      .single()
    if (sessionErr || !sessionRow) throw new Error(`seed victim session: ${sessionErr?.message}`)
    tracker.sessions.add(sessionRow.id)

    const { data, error } = await crossOrgClient.rpc('list_my_internal_exam_history')
    expect(error).toBeNull()
    const rows = (data ?? []) as Array<{ id: string }>
    expect(rows.find((r) => r.id === sessionRow.id)).toBeUndefined()
  })

  // -------------------------------------------------------------------------
  // Vector BE (#572): user-transfer cross-org session isolation
  // -------------------------------------------------------------------------

  test('BE: org-A mock_exam session does not block start_exam_session after user is transferred to org-B', async () => {
    // Scenario: a student has an active mock_exam session under org-A (egmont).
    // An admin transfers them to org-B (redteam-other-org). They then call
    // start_exam_session for the same subject under org-B.
    //
    // EXPECTED (mig 20260428000004):
    //   1. The duplicate-active EXISTS guard — which now filters
    //      `AND organization_id = v_org_id` — does NOT match the org-A session
    //      because v_org_id is now org-B. The call does not raise
    //      'an exam session is already in progress for this subject'.
    //   2. The stale-session lookup — also filtered by organization_id — does
    //      NOT auto-complete the org-A session (ended_at remains null).
    //
    // org-B has no exam_config for this subject, so start_exam_session fails
    // with 'no exam configuration found for this subject' — proving we passed
    // both org-A guards. A 'no exam configuration found' error is downstream of
    // both the stale-session lookup and the duplicate-active check; reaching it
    // means neither guard fired on the org-A session.

    // ── Non-vacuity: confirm the org-A session genuinely exists ─────────────
    // Seed it as OVERDUE (started_at ~67 min ago, well past time_limit + 30s grace)
    // so the stale-session auto-complete lookup WOULD fire on it if its org filter
    // were absent. Combined with the active (ended_at null) duplicate-active guard,
    // asserting ended_at stays null then non-vacuously proves BOTH org filters
    // (stale-session lookup + duplicate-active EXISTS) in start_exam_session.
    const orgASessionStart = new Date(Date.now() - 4_000_000).toISOString()

    // Declared before the try so the finally restore/cleanup always runs even
    // if the org-A seed-insert or the org transfer throws (issue #768 — without
    // this the victim is stranded in org-B and downstream specs fail with
    // 'an exam session is already in progress').
    let orgASessionId: string | null = null
    let orgBSessionId: string | null = null
    try {
      const { data: orgARow, error: seedErr } = await adminClient
        .from('quiz_sessions')
        .insert({
          organization_id: egmontOrgId,
          student_id: victimUserId,
          mode: 'mock_exam',
          subject_id: examSubjectId,
          config: { question_ids: [], pass_mark: 75 },
          total_questions: 1,
          time_limit_seconds: 3600,
          started_at: orgASessionStart,
        })
        .select('id, ended_at')
        .single()
      if (seedErr || !orgARow) throw new Error(`BE seed org-A session: ${seedErr?.message}`)
      orgASessionId = orgARow.id

      // Prove the org-A session is active (ended_at null) before transfer.
      expect(orgARow.ended_at).toBeNull()

      // ── Transfer: move student from org-A → org-B ────────────────────────────
      const { data: transferred, error: transferErr } = await adminClient
        .from('users')
        .update({ organization_id: otherOrgId })
        .eq('id', victimUserId)
        .select('id')
      expect(transferErr).toBeNull()
      expect(transferred).toHaveLength(1)

      // ── Authenticate as victim (now in org-B) and call start_exam_session ────
      // The RPC re-reads organization_id from users at call time, so v_org_id = org-B.
      const victimClient = await createAuthenticatedClient(VICTIM_EMAIL, VICTIM_PASSWORD)

      const { data, error } = await victimClient.rpc('start_exam_session', {
        p_subject_id: examSubjectId,
      })

      // org-B has no exam_config for this subject, so the expected failure is
      // 'no exam configuration found'. That error code is reached only AFTER
      // both org-scoped guards (stale-session lookup + duplicate-active check)
      // have been evaluated and found no matching org-A session.
      // A 'an exam session is already in progress' error here would mean the
      // org filter is missing — which is the regression this test guards against.
      if (error) {
        expect(error.message ?? '').not.toMatch(/an exam session is already in progress/i)
        expect(error.message ?? '').toMatch(/no exam configuration found/i)
      } else {
        // If org-B DID have a config (e.g. ensureExamConfig was called for it
        // elsewhere), a fresh session was returned — verify it differs from the
        // org-A session, proving the duplicate-active guard did not block.
        const result = data as { session_id: string } | null
        expect(result?.session_id).toBeDefined()
        expect(result?.session_id).not.toBe(orgASessionId)
        orgBSessionId = result?.session_id ?? null
      }

      // ── Assert org-A session was NOT auto-completed ────────────────────────
      // The stale-session lookup is filtered by organization_id = v_org_id
      // (now org-B), so the org-A session must still be active.
      // Non-vacuity guarantee: we confirmed ended_at was null before the call.
      const { data: orgAAfter, error: readErr } = await adminClient
        .from('quiz_sessions')
        .select('ended_at')
        .eq('id', orgASessionId)
        .is('deleted_at', null)
        .single()
      expect(readErr).toBeNull()
      expect(orgAAfter?.ended_at).toBeNull()
    } finally {
      // ── Restore victim's org to egmont (hermiticity §7) ─────────────────
      // No throwing expect() here — cleanup must never mask the original test
      // failure. Verify a row was actually restored via .select('id') + length.
      const { data: restored, error: restoreErr } = await adminClient
        .from('users')
        .update({ organization_id: egmontOrgId })
        .eq('id', victimUserId)
        .select('id')
      if (restoreErr) {
        console.error(`[BE cleanup] restore victim org failed: ${restoreErr.message}`)
      } else if (!restored?.length) {
        console.error(`[BE cleanup] restore matched 0 rows for victim ${victimUserId}`)
      }

      // Soft-delete the org-A fixture session (orgASessionId may be null if the
      // seed-insert threw before assignment).
      if (orgASessionId) {
        const { data: discardedA, error: delAErr } = await adminClient
          .from('quiz_sessions')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', orgASessionId)
          .is('deleted_at', null)
          .select('id')
        if (delAErr) {
          console.error(`[BE cleanup] org-A session soft-delete failed: ${delAErr.message}`)
        } else if ((discardedA?.length ?? 0) > 0) {
          console.log(`[BE cleanup] soft-deleted org-A fixture session ${orgASessionId}`)
        }
      }

      // Soft-delete the org-B session if one was created.
      if (orgBSessionId) {
        const { data: discardedB, error: delBErr } = await adminClient
          .from('quiz_sessions')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', orgBSessionId)
          .is('deleted_at', null)
          .select('id')
        if (delBErr) {
          console.error(`[BE cleanup] org-B session soft-delete failed: ${delBErr.message}`)
        } else if ((discardedB?.length ?? 0) > 0) {
          console.log(`[BE cleanup] soft-deleted org-B fixture session ${orgBSessionId}`)
        }
      }
    }
  })

  // -------------------------------------------------------------------------
  // cross-tenant flagged_questions RLS isolation
  // -------------------------------------------------------------------------

  test('cross-org client cannot read another user flagged_questions row via direct SELECT', async () => {
    // Non-vacuity: seed a flagged_questions row owned by the egmont victim via
    // the admin client (service role bypasses RLS), then assert the admin sees
    // it. Without the row the "attacker sees 0" assertion passes vacuously.
    expect(egmontQuestionIds.length).toBeGreaterThan(0)
    const victimQuestionId = egmontQuestionIds[0]
    const { error: seedErr } = await adminClient
      .from('flagged_questions')
      .upsert(
        { student_id: egmontVictimUserId, question_id: victimQuestionId, deleted_at: null },
        { onConflict: 'student_id,question_id', ignoreDuplicates: false },
      )
    expect(seedErr).toBeNull()
    tracker.flags.add(`${egmontVictimUserId}::${victimQuestionId}`)

    const { data: adminRows, error: adminErr } = await adminClient
      .from('flagged_questions')
      .select('question_id')
      .eq('student_id', egmontVictimUserId)
      .eq('question_id', victimQuestionId)
      .is('deleted_at', null)
    expect(adminErr).toBeNull()
    expect(adminRows?.length ?? 0).toBeGreaterThan(0)

    // Cross-org attacker probes by victim student_id.
    // RLS flagged_questions_student_select USING (student_id = auth.uid()) scopes
    // to the caller → 0 rows even though a row exists.
    const { data, error } = await crossOrgClient
      .from('flagged_questions')
      .select('question_id')
      .eq('student_id', egmontVictimUserId)
    expect(error).toBeNull()
    expect(Array.isArray(data) ? data.length : -1).toBe(0)
  })

  // -------------------------------------------------------------------------
  // cross-tenant user_consents RLS isolation
  // -------------------------------------------------------------------------

  test('cross-org client cannot read another user_consents row via a user_id probe', async () => {
    // Non-vacuity: seed a user_consents row owned by the egmont victim via the
    // admin client (service role bypasses the WITH CHECK(false) insert policy).
    // Without the row, "attacker sees 0" passes vacuously.
    const { data: consentRow, error: seedErr } = await adminClient
      .from('user_consents')
      .insert({
        user_id: egmontVictimUserId,
        document_type: 'terms_of_service',
        document_version: RPC_CROSS_TENANT_CONSENT_VERSION,
        accepted: true,
      })
      .select('id')
      .single<{ id: string }>()
    expect(seedErr).toBeNull()
    expect(consentRow?.id).toBeDefined()
    seededVictimConsentId = consentRow?.id ?? null
    if (seededVictimConsentId) tracker.consents.add(seededVictimConsentId)

    const { data: adminRows, error: adminErr } = await adminClient
      .from('user_consents')
      .select('id')
      .eq('user_id', egmontVictimUserId)
      .eq('document_version', RPC_CROSS_TENANT_CONSENT_VERSION)
    expect(adminErr).toBeNull()
    expect(adminRows?.length ?? 0).toBeGreaterThan(0)

    // Cross-org attacker probes by victim user_id.
    // RLS user_consents_select_own USING (user_id = auth.uid()) scopes to the caller
    // → 0 rows even though the victim row exists.
    const { data, error } = await crossOrgClient
      .from('user_consents')
      .select('id, document_type')
      .eq('user_id', egmontVictimUserId)
    expect(error).toBeNull()
    expect(Array.isArray(data) ? data.length : -1).toBe(0)
  })

  // -------------------------------------------------------------------------
  // Vector CL3 (#784): get_session_reports non-vacuous IDOR
  // -------------------------------------------------------------------------

  test('CL3 (#784): get_session_reports never returns another user completed session to a cross-org caller', async () => {
    // Non-vacuity: seed a COMPLETED quiz_session for the egmont victim via the
    // service-role client (bypasses RLS). get_session_reports requires
    // ended_at IS NOT NULL and mode <> 'internal_exam' (mig 091), so the seeded
    // session uses mode 'quick_quiz' with ended_at set.
    const startedAt = new Date(Date.now() - 20 * 60 * 1000).toISOString()
    const endedAt = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    const { data: sessionRow, error: seedErr } = await adminClient
      .from('quiz_sessions')
      .insert({
        organization_id: egmontOrgId,
        student_id: egmontVictimUserId,
        mode: 'quick_quiz',
        subject_id: examSubjectId,
        config: { question_ids: [], pass_mark: 75 },
        total_questions: 1,
        started_at: startedAt,
        ended_at: endedAt,
        score_percentage: 100,
        passed: true,
        correct_count: 1,
      })
      .select('id')
      .single()
    if (seedErr || !sessionRow) throw new Error(`CL3 seed victim session: ${seedErr?.message}`)
    tracker.sessions.add(sessionRow.id)

    // Owner-visibility (non-vacuity): the victim's OWN authenticated client sees
    // the seeded session via get_session_reports — proving the row is genuinely
    // reportable, so the attacker's "0 rows" assertion below is non-vacuous.
    // p_limit: 100 ensures the seeded row is not paged out behind other sessions.
    const victimClient = await createAuthenticatedClient(VICTIM_EMAIL, VICTIM_PASSWORD)
    const { data: victimRows, error: victimErr } = await victimClient.rpc('get_session_reports', {
      p_limit: 100,
    })
    expect(victimErr).toBeNull()
    const victimReports = (victimRows ?? []) as Array<{ id: string }>
    expect(victimReports.length).toBeGreaterThan(0)
    expect(victimReports.find((r) => r.id === sessionRow.id)).toBeDefined()

    // Isolation: get_session_reports only ever returns the caller's own sessions
    // (WHERE qs.student_id = auth.uid()), so the cross-org attacker must never
    // see the victim's seeded session id.
    const { data: attackerRows, error: attackerErr } = await crossOrgClient.rpc(
      'get_session_reports',
      { p_limit: 100 },
    )
    expect(attackerErr).toBeNull()
    const attackerReports = (attackerRows ?? []) as Array<{ id: string }>
    expect(attackerReports.find((r) => r.id === sessionRow.id)).toBeUndefined()
  })

  test.afterAll(async () => {
    // E2E hermiticity (code-style.md §7): remove all fixture rows seeded in this
    // file. Uses cleanupFixtures for sessions, codes, flags, consents.
    // The BE test uses its own inline try/finally for user-org restore (not routed
    // through the tracker — the org restore must happen immediately in finally).
    await cleanupFixtures(adminClient, tracker)
  })
})
