/**
 * Red Team Spec: Cross-Tenant RPC Isolation
 *
 * Vector D (MEDIUM): A user from a different organization attempts to start a quiz
 * session using a subject that belongs to egmont-aviation. RLS should prevent
 * cross-tenant data access at both the RPC and direct SELECT level.
 *
 * Status: Expected to PASS (defenses should hold).
 * If any assertion fails, it indicates an RLS gap requiring immediate fix.
 */

import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import {
  createCrossOrgUser,
  E2E_REDTEAM_CODE_PREFIX,
  ensureExamConfig,
  pickSubjectWithQuestions,
  seedRedTeamUsers,
  seedVictimResponses,
  VICTIM_EMAIL,
  VICTIM_PASSWORD,
} from './helpers/seed'

test.describe('Red Team: Cross-Tenant RPC Isolation', () => {
  let crossOrgClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let adminClient: Awaited<ReturnType<typeof getAdminClient>>
  let egmontSubjectId: string
  let egmontTopicId: string
  let egmontQuestionIds: string[]
  let egmontVictimUserId: string
  let egmontOrgId: string
  // A subject GUARANTEED to have egmont questions + an enabled exam_config, so
  // the cross-org exam/pool probes below prove org-scoping rather than the
  // vacuous "this subject has no data anywhere" case.
  let examSubjectId: string
  let examTopicId: string
  let examConfigId: string
  let seededVictimCodeId: string | null = null
  let seededVictimSessionId: string | null = null
  // Vector BE: user-transfer cross-org session isolation
  let otherOrgId: string
  let victimUserId: string
  // Vector Q: cross-tenant flagged_questions RLS isolation
  let seededVictimFlaggedQuestionId: string | null = null
  // Vector X (rpc-cross-tenant): cross-tenant user_consents RLS isolation
  // Uses a distinct version marker to avoid colliding with user-consents-isolation.spec.ts
  let seededVictimConsentId: string | null = null
  // Vector CL3 (#784): completed quiz_session seeded for the egmont victim, used
  // to prove get_session_reports never leaks it to a cross-org caller.
  let seededCL3SessionId: string | null = null
  // ≤20 chars: user_consents.document_version CHECK (char_length BETWEEN 1 AND 20)
  const RPC_CROSS_TENANT_CONSENT_VERSION = 'rct-x-1.0'

  test.beforeAll(async () => {
    const seed = await seedRedTeamUsers()
    egmontVictimUserId = seed.victimUserId
    victimUserId = seed.victimUserId
    egmontOrgId = seed.orgId
    otherOrgId = seed.otherOrgId
    const crossOrgUser = await createCrossOrgUser()
    crossOrgClient = await createAuthenticatedClient(crossOrgUser.email, crossOrgUser.password)
    adminClient = getAdminClient()

    // Seed the egmont victim with 8 correct responses so that the cross-org
    // RPC assertions prove isolation (empty/zeroed) rather than absence of data.
    await seedVictimResponses()

    // Resolve an egmont subject that definitely has active questions, and ensure
    // an enabled exam_config (+ distribution row) exists for it — the cross-org
    // AH/CB/AK probes assert the attacker is blocked from THIS populated subject.
    const examPick = await pickSubjectWithQuestions(adminClient, { orgId: egmontOrgId })
    examSubjectId = examPick.subjectId
    examTopicId = examPick.topicId
    examConfigId = await ensureExamConfig(egmontOrgId, examSubjectId, examTopicId)

    // Reuse that same guaranteed-populated subject for the egmont quick-quiz
    // probes (start_quiz_session, direct SELECT). Deriving from
    // pickSubjectWithQuestions — instead of an arbitrary first easa_subjects row
    // that may have no active questions — keeps egmontQuestionIds non-empty so the
    // cross-org isolation proofs stay non-vacuous.
    egmontSubjectId = examSubjectId
    egmontTopicId = examTopicId

    // Scope to examTopicId too: start_quiz_session validates question_ids against
    // (organization_id = caller's org) AND (topic_id = p_topic_id). Pinning the
    // payload to examTopicId means a legitimate egmont student WOULD pass that
    // check, so the cross-org caller below is rejected solely by org-scoping —
    // not by an incidental topic mismatch.
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

  test('cross-org user cannot start a quiz session for an egmont-aviation subject', async () => {
    // Attack: submit a payload that is fully valid for a legitimate egmont
    // student — real egmont (subject, topic, question_ids). start_quiz_session
    // scopes question validation to the CALLER's org, so for the cross-org
    // caller every question fails `q.organization_id = v_org_id` and the RPC
    // raises `invalid_question_ids`. The payload's same-org/same-topic validity
    // is what makes this prove org-scoping rather than a topic mismatch.
    const { data, error } = await crossOrgClient.rpc('start_quiz_session', {
      p_mode: 'quick_quiz',
      p_subject_id: egmontSubjectId,
      p_topic_id: egmontTopicId,
      p_question_ids: egmontQuestionIds,
    })

    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/invalid_question_ids/i)
    expect(data ?? null).toBeNull()
  })

  test('cross-org user cannot SELECT questions from egmont-aviation via anon client', async () => {
    // Direct table read: the cross-org user's JWT should scope RLS to their own org.
    // They must see 0 rows from the egmont-aviation subjects/questions tables.
    const { data: questions, error } = await crossOrgClient
      .from('questions')
      .select('id, topic_id')
      .limit(20)

    expect(error).toBeNull()

    if (questions && questions.length > 0) {
      // Confirm none of the returned questions belong to egmont-aviation topics
      const topicIds = questions.map((q) => q.topic_id)

      const { data: egmontTopics } = await adminClient
        .from('easa_topics')
        .select('id')
        .in('id', topicIds)

      // If the admin sees these topics, the cross-org user is leaking egmont data
      expect(egmontTopics?.length ?? 0).toBe(0)
    }
    // If 0 questions returned, isolation is confirmed — nothing to check further
  })

  test('cross-org user cannot read egmont-aviation quiz_sessions', async () => {
    // An attacker from another org must not be able to enumerate sessions
    // from egmont-aviation students.
    const { data: sessions, error } = await crossOrgClient
      .from('quiz_sessions')
      .select('id, student_id')
      .limit(10)

    expect(error).toBeNull()

    if (sessions && sessions.length > 0) {
      // Any sessions returned must belong to the cross-org user themselves
      const uniqueStudentIds = [...new Set(sessions.map((s) => s.student_id))]

      // Get the cross-org user's own id to verify sessions are scoped
      const { data: me } = await crossOrgClient.auth.getUser()
      const crossOrgUserId = me?.user?.id

      for (const studentId of uniqueStudentIds) {
        expect(studentId).toBe(crossOrgUserId)
      }
    }
  })

  test('cross-org user cannot read egmont-aviation student_responses', async () => {
    const { data: progress, error } = await crossOrgClient
      .from('student_responses')
      .select('id, student_id')
      .limit(10)

    expect(error).toBeNull()

    if (progress && progress.length > 0) {
      const { data: me } = await crossOrgClient.auth.getUser()
      const crossOrgUserId = me?.user?.id

      for (const row of progress) {
        expect(row.student_id).toBe(crossOrgUserId)
      }
    }
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
    seededVictimCodeId = codeRow.id

    const { data, error } = await crossOrgClient.rpc('list_my_active_internal_exam_codes')
    expect(error).toBeNull()
    const rows = (data ?? []) as Array<{ id: string }>
    expect(rows.find((r) => r.id === seededVictimCodeId)).toBeUndefined()
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
    seededVictimSessionId = sessionRow.id

    const { data, error } = await crossOrgClient.rpc('list_my_internal_exam_history')
    expect(error).toBeNull()
    const rows = (data ?? []) as Array<{ id: string }>
    expect(rows.find((r) => r.id === seededVictimSessionId)).toBeUndefined()
  })

  // -------------------------------------------------------------------------
  // #673 — Aggregation RPC cross-org isolation (four vectors, issue #668 RPC layer)
  // -------------------------------------------------------------------------

  test('cross-org student sees no egmont questions or correct counts from get_student_mastery_stats', async () => {
    // get_student_mastery_stats builds its denominator from questions visible to
    // the caller via tenant_isolation RLS, and self-scopes the correct-answer
    // numerator to auth.uid(). The cross-org caller's org has no questions, so the
    // result must be EMPTY — proving no egmont question (denominator) leaks across
    // tenants. The every(correct===0) guard additionally documents that no egmont
    // victim correct-count could appear. (The non-vacuous numerator self-scope
    // proof lives in dashboard-stats-rpc-isolation.spec.ts BW3, where the egmont
    // instructor's denominator IS populated.)
    const { data, error } = await crossOrgClient.rpc('get_student_mastery_stats')
    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(0)
    expect((data ?? []).every((r: { correct: number }) => r.correct === 0)).toBe(true)
  })

  test('cross-org student sees no egmont question counts from get_question_counts', async () => {
    // get_question_counts is org-scoped via RLS on questions.
    // redteam-other-org has no seeded questions, so a non-empty result would
    // indicate an egmont question count leaked to another tenant.
    const { data, error } = await crossOrgClient.rpc('get_question_counts', {
      p_status: 'active',
    })
    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(0)
  })

  test('cross-org student sees no practice history from egmont victim in get_student_last_practiced', async () => {
    // get_student_last_practiced is self-scoped to auth.uid(); the cross-org
    // caller has zero responses, so the result must be empty. Any row would
    // mean the egmont victim's last-practiced timestamps leaked.
    const { data, error } = await crossOrgClient.rpc('get_student_last_practiced')
    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(0)
  })

  test('cross-org student sees zero streak counts from get_student_streak', async () => {
    // get_student_streak always returns exactly one row {current_streak, best_streak}.
    // A cross-org caller with no responses must see {0, 0}. Non-zero values
    // would indicate the egmont victim's streak data leaked across orgs.
    const { data, error } = await crossOrgClient.rpc('get_student_streak')
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data?.[0]?.current_streak).toBe(0)
    expect(data?.[0]?.best_streak).toBe(0)
  })

  // -------------------------------------------------------------------------
  // Cross-org exam / question-pool / distribution isolation (#545, #690, #517)
  // -------------------------------------------------------------------------

  test('cross-org student cannot start an exam for an egmont subject (Vector AH, #545)', async () => {
    // egmont HAS an enabled exam_config for examSubjectId (seeded in beforeAll);
    // the attacker's org does NOT. start_exam_session scopes the exam_configs
    // lookup to the caller's org, so the cross-org caller hits v_config_id IS NULL
    // → RAISE 'no exam configuration found for this subject'. The egmont config
    // existing is what makes this prove org-scoping, not global absence.
    const { data, error } = await crossOrgClient.rpc('start_exam_session', {
      p_subject_id: examSubjectId,
    })
    expect(error).not.toBeNull()
    expect(error?.message ?? '').toMatch(/no exam configuration found/i)
    expect(data ?? null).toBeNull()
  })

  test('cross-org student sees no egmont questions from get_random_question_ids (Vector CB, #690)', async () => {
    // Non-vacuity: examSubjectId has active egmont questions (pickSubjectWithQuestions
    // guarantees it). get_random_question_ids is SECURITY INVOKER → tenant_isolation
    // RLS on questions filters to the attacker's org, which has none for this subject.
    expect(egmontQuestionIds.length).toBeGreaterThan(0)
    const { data, error } = await crossOrgClient.rpc('get_random_question_ids', {
      p_subject_id: examSubjectId,
      p_topic_ids: null,
      p_subtopic_ids: null,
      p_count: 10,
      p_filters: null,
    })
    expect(error).toBeNull()
    expect(Array.isArray(data) ? data.length : 0).toBe(0)
  })

  test('cross-org student sees no egmont counts from get_filtered_question_counts (Vector CB, #690)', async () => {
    // Same tenant_isolation defense as get_random_question_ids — the cross-org
    // caller enumerates no per-topic counts for an egmont subject.
    const { data, error } = await crossOrgClient.rpc('get_filtered_question_counts', {
      p_subject_id: examSubjectId,
      p_topic_ids: null,
      p_subtopic_ids: null,
      p_filters: null,
    })
    expect(error).toBeNull()
    expect(Array.isArray(data) ? data.length : 0).toBe(0)
  })

  test('cross-org student cannot read exam_config_distributions (Vector AK, #517)', async () => {
    // exam_config_distributions has an admin-only SELECT policy (is_admin() AND
    // same org) and NO student policy — so a non-admin cross-org student sees
    // none of egmont's rows. Non-vacuity: admin confirms the egmont config has
    // ≥1 distribution row, then the cross-org student SELECT for THAT SAME
    // config returns 0 (RLS blocks at the role boundary).
    const { data: adminRows, error: adminErr } = await adminClient
      .from('exam_config_distributions')
      .select('id')
      .eq('exam_config_id', examConfigId)
    expect(adminErr).toBeNull()
    expect(adminRows?.length ?? 0).toBeGreaterThan(0)

    const { data, error } = await crossOrgClient
      .from('exam_config_distributions')
      .select('id')
      .eq('exam_config_id', examConfigId)
    expect(error).toBeNull()
    expect(data?.length ?? 0).toBe(0)
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
  // Vector Q (#276): cross-tenant flagged_questions RLS isolation
  // -------------------------------------------------------------------------

  test('Q (#276): cross-org client cannot read another user flagged_questions row via direct SELECT', async () => {
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
    seededVictimFlaggedQuestionId = victimQuestionId

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
  // Vector X (#384): cross-tenant user_consents RLS isolation
  // -------------------------------------------------------------------------

  test('X (#384): cross-org client cannot read another user_consents row via a user_id probe', async () => {
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
  // Vector CL2/CL3 (#784): get_session_reports auth-passed control + non-vacuous IDOR
  // -------------------------------------------------------------------------

  test('CL2 (#784): authenticated cross-org user with no completed sessions gets an empty get_session_reports result', async () => {
    // Auth-passed control: get_session_reports clears the auth.uid() null-check
    // (the caller is authenticated, so it does NOT raise 'Not authenticated'),
    // but the cross-org user has no completed quiz_sessions. The self-scoped
    // query (WHERE qs.student_id = auth.uid() AND ended_at IS NOT NULL) returns
    // zero rows → error null, empty array. This is the no-rows baseline; CL3
    // below is the true non-vacuous ownership proof.
    const { data, error } = await crossOrgClient.rpc('get_session_reports', {})
    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(0)
  })

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
    seededCL3SessionId = sessionRow.id

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
    expect(victimReports.find((r) => r.id === seededCL3SessionId)).toBeDefined()

    // Isolation: get_session_reports only ever returns the caller's own sessions
    // (WHERE qs.student_id = auth.uid()), so the cross-org attacker must never
    // see the victim's seeded session id.
    const { data: attackerRows, error: attackerErr } = await crossOrgClient.rpc(
      'get_session_reports',
      { p_limit: 100 },
    )
    expect(attackerErr).toBeNull()
    const attackerReports = (attackerRows ?? []) as Array<{ id: string }>
    expect(attackerReports.find((r) => r.id === seededCL3SessionId)).toBeUndefined()
  })

  test.afterAll(async () => {
    // E2E hermiticity (code-style.md §7): remove the fixture code/session rows
    // the BY-vector tests inserted into egmont so downstream specs don't see
    // them. Soft-delete sessions (quiz_sessions is soft-delete only) and
    // hard-delete the consent row (append-only, no deleted_at column).
    //
    // Each block runs in its own try/catch so a failure in one cleanup never
    // skips the rest — otherwise a throw in the first block leaks the CL3
    // session and others into downstream specs (workers:1, alphabetical order).
    // Errors are accumulated and re-thrown at the end; each block resets its
    // tracking var in finally so a failed delete can't replay a stale id.
    const errors: string[] = []
    if (seededVictimSessionId) {
      try {
        const { data: discarded, error } = await adminClient
          .from('quiz_sessions')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', seededVictimSessionId)
          .is('deleted_at', null)
          .select('id')
        if (error) throw new Error(`session soft-delete: ${error.message}`)
        if ((discarded?.length ?? 0) > 0) {
          console.log(
            `[rpc-cross-tenant cleanup] soft-deleted ${discarded?.length} fixture session(s)`,
          )
        }
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
      } finally {
        seededVictimSessionId = null
      }
    }
    if (seededVictimCodeId) {
      // Soft-delete per security.md §6 — never hard DELETE.
      try {
        const { data: discarded, error } = await adminClient
          .from('internal_exam_codes')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', seededVictimCodeId)
          .is('deleted_at', null)
          .select('id')
        if (error) throw new Error(`code soft-delete: ${error.message}`)
        if ((discarded?.length ?? 0) > 0) {
          console.log(
            `[rpc-cross-tenant cleanup] soft-deleted ${discarded?.length} fixture code(s)`,
          )
        }
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
      } finally {
        seededVictimCodeId = null
      }
    }
    // Vector CL3 cleanup: soft-delete the seeded completed quiz_session.
    if (seededCL3SessionId) {
      try {
        const { data: discarded, error } = await adminClient
          .from('quiz_sessions')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', seededCL3SessionId)
          .is('deleted_at', null)
          .select('id')
        if (error) throw new Error(`CL3 session soft-delete: ${error.message}`)
        if ((discarded?.length ?? 0) > 0) {
          console.log(`[rpc-cross-tenant cleanup] soft-deleted CL3 fixture session`)
        }
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
      } finally {
        seededCL3SessionId = null
      }
    }
    // Vector Q cleanup: soft-delete the seeded flagged_questions row.
    if (seededVictimFlaggedQuestionId) {
      try {
        const { data: discarded, error } = await adminClient
          .from('flagged_questions')
          .update({ deleted_at: new Date().toISOString() })
          .eq('student_id', egmontVictimUserId)
          .eq('question_id', seededVictimFlaggedQuestionId)
          .is('deleted_at', null)
          .select('question_id')
        if (error) throw new Error(`flagged_questions soft-delete: ${error.message}`)
        if ((discarded?.length ?? 0) > 0) {
          console.log(`[rpc-cross-tenant cleanup] soft-deleted flagged_questions fixture row`)
        }
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
      } finally {
        seededVictimFlaggedQuestionId = null
      }
    }
    // Vector X cleanup: hard-delete the seeded user_consents row.
    // user_consents is append-only (no deleted_at column), so the service role
    // performs a hard DELETE — matching the pattern in user-consents-isolation.spec.ts.
    if (seededVictimConsentId) {
      try {
        const { data: discarded, error } = await adminClient
          .from('user_consents')
          .delete()
          .eq('id', seededVictimConsentId)
          .select('id')
        if (error) throw new Error(`user_consents hard-delete: ${error.message}`)
        if ((discarded?.length ?? 0) > 0) {
          console.log(`[rpc-cross-tenant cleanup] hard-deleted user_consents fixture row`)
        }
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
      } finally {
        seededVictimConsentId = null
      }
    }
    if (errors.length > 0) {
      throw new Error(`[rpc-cross-tenant cleanup]: ${errors.join('; ')}`)
    }
  })
})
