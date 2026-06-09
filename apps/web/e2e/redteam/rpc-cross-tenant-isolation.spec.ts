/**
 * Red Team Spec: Cross-Tenant RPC Isolation — probe-only tests (no seeding)
 *
 * Vector D (MEDIUM): A user from a different organization attempts to start a quiz
 * session using a subject that belongs to egmont-aviation. RLS should prevent
 * cross-tenant data access at both the RPC and direct SELECT level.
 *
 * This file covers the 13 tests that PROBE existing data without seeding any
 * fixture rows. The 6 tests that seed rows live in rpc-cross-tenant-reports.spec.ts.
 *
 * Status: Expected to PASS (defenses should hold).
 * If any assertion fails, it indicates an RLS gap requiring immediate fix.
 */

import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import {
  createCrossOrgUser,
  ensureExamConfig,
  pickSubjectWithQuestions,
  seedRedTeamUsers,
  seedVictimResponses,
} from './helpers/seed'

test.describe('Red Team: Cross-Tenant RPC Isolation', () => {
  let crossOrgClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let adminClient: Awaited<ReturnType<typeof getAdminClient>>
  let egmontSubjectId: string
  let egmontTopicId: string
  let egmontQuestionIds: string[]
  let egmontOrgId: string
  // A subject GUARANTEED to have egmont questions + an enabled exam_config, so
  // the cross-org exam/pool probes below prove org-scoping rather than the
  // vacuous "this subject has no data anywhere" case.
  let examSubjectId: string
  let examTopicId: string
  let examConfigId: string

  test.beforeAll(async () => {
    const seed = await seedRedTeamUsers()
    egmontOrgId = seed.orgId
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
  // Vector CL2 (#784): get_session_reports auth-passed control
  // -------------------------------------------------------------------------

  test('CL2 (#784): authenticated cross-org user with no completed sessions gets an empty get_session_reports result', async () => {
    // Auth-passed control: get_session_reports clears the auth.uid() null-check
    // (the caller is authenticated, so it does NOT raise 'Not authenticated'),
    // but the cross-org user has no completed quiz_sessions. The self-scoped
    // query (WHERE qs.student_id = auth.uid() AND ended_at IS NOT NULL) returns
    // zero rows → error null, empty array. This is the no-rows baseline; CL3
    // (in rpc-cross-tenant-reports.spec.ts) is the true non-vacuous ownership proof.
    const { data, error } = await crossOrgClient.rpc('get_session_reports', {})
    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(0)
  })
})
