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

  test.beforeAll(async () => {
    const seed = await seedRedTeamUsers()
    egmontVictimUserId = seed.victimUserId
    egmontOrgId = seed.orgId
    const crossOrgUser = await createCrossOrgUser()
    crossOrgClient = await createAuthenticatedClient(crossOrgUser.email, crossOrgUser.password)
    adminClient = getAdminClient()

    // Seed the egmont victim with 8 correct responses so that the cross-org
    // RPC assertions prove isolation (empty/zeroed) rather than absence of data.
    await seedVictimResponses()

    // Resolve a real subject from egmont-aviation for use in attack vectors
    const { data: subjects, error } = await adminClient.from('easa_subjects').select('id').limit(1)

    expect(error).toBeNull()
    expect(subjects).not.toBeNull()
    expect(subjects!.length).toBeGreaterThan(0)

    egmontSubjectId = subjects![0].id

    // Fetch egmont question IDs — the cross-org user will attempt to use these
    const { data: topics } = await adminClient
      .from('easa_topics')
      .select('id')
      .eq('subject_id', egmontSubjectId)
      .limit(5)
    egmontTopicId = (topics ?? [])[0]?.id ?? egmontSubjectId
    const topicIds = (topics ?? []).map((t) => t.id)

    const { data: qs } = await adminClient
      .from('questions')
      .select('id')
      .in('topic_id', topicIds)
      .is('deleted_at', null)
      .limit(5)
    egmontQuestionIds = (qs ?? []).map((q) => q.id)

    // Resolve an egmont subject that definitely has active questions, and ensure
    // an enabled exam_config (+ distribution row) exists for it — the cross-org
    // AH/CB/AK probes assert the attacker is blocked from THIS populated subject.
    const examPick = await pickSubjectWithQuestions(adminClient, { orgId: egmontOrgId })
    examSubjectId = examPick.subjectId
    examTopicId = examPick.topicId
    examConfigId = await ensureExamConfig(egmontOrgId, examSubjectId, examTopicId)
  })

  test('cross-org user cannot start a quiz session for an egmont-aviation subject', async () => {
    // Attack: use known egmont-aviation subject_id and question_ids in start_quiz_session.
    // RLS on the questions/subjects tables should cause the RPC to find 0 questions,
    // resulting in an error or an empty session.
    const { data, error } = await crossOrgClient.rpc('start_quiz_session', {
      p_mode: 'quick_quiz',
      p_subject_id: egmontSubjectId,
      p_topic_id: egmontTopicId,
      p_question_ids: egmontQuestionIds,
    })

    // The RPC should either return an error (could not find enough questions)
    // or return a session with 0 question_ids — never a valid session with real questions.
    if (error) {
      // Acceptable: RPC raised because subject is inaccessible
      expect(error).not.toBeNull()
    } else {
      // If it returned something, it must not contain any question IDs from the other org
      const session = data as { question_ids?: string[] } | null
      const questionCount = session?.question_ids?.length ?? 0
      expect(questionCount).toBe(0)
    }
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

  test.afterAll(async () => {
    // E2E hermiticity (code-style.md §7): remove the fixture code/session rows
    // the BY-vector tests inserted into egmont so downstream specs don't see
    // them. Soft-delete the session (quiz_sessions is soft-delete only) and
    // hard-delete the code row (no FK children — code was never consumed).
    if (seededVictimSessionId) {
      const { data: discarded, error } = await adminClient
        .from('quiz_sessions')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', seededVictimSessionId)
        .is('deleted_at', null)
        .select('id')
      if (error) {
        console.error(`[rpc-cross-tenant cleanup] session soft-delete error: ${error.message}`)
      } else if ((discarded?.length ?? 0) > 0) {
        console.log(
          `[rpc-cross-tenant cleanup] soft-deleted ${discarded?.length} fixture session(s)`,
        )
      }
    }
    if (seededVictimCodeId) {
      // Soft-delete per security.md §6 — never hard DELETE.
      const { data: discarded, error } = await adminClient
        .from('internal_exam_codes')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', seededVictimCodeId)
        .is('deleted_at', null)
        .select('id')
      if (error) {
        console.error(`[rpc-cross-tenant cleanup] code soft-delete error: ${error.message}`)
      } else if ((discarded?.length ?? 0) > 0) {
        console.log(`[rpc-cross-tenant cleanup] soft-deleted ${discarded?.length} fixture code(s)`)
      }
    }
  })
})
