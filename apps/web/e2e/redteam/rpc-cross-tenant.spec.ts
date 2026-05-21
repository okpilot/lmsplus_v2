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
import { createCrossOrgUser, pickSubjectWithQuestions, seedRedTeamUsers } from './helpers/seed'

test.describe('Red Team: Cross-Tenant RPC Isolation', () => {
  let crossOrgClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let adminClient: Awaited<ReturnType<typeof getAdminClient>>
  let egmontSubjectId: string
  let egmontTopicId: string
  let egmontQuestionIds: string[]
  let egmontVictimUserId: string
  let egmontOrgId: string
  let seededVictimCodeId: string | null = null
  let seededVictimSessionId: string | null = null

  test.beforeAll(async () => {
    const seed = await seedRedTeamUsers()
    egmontVictimUserId = seed.victimUserId
    egmontOrgId = seed.orgId
    const crossOrgUser = await createCrossOrgUser()
    crossOrgClient = await createAuthenticatedClient(crossOrgUser.email, crossOrgUser.password)
    adminClient = getAdminClient()

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
    const victimCodeText = `RT${Date.now().toString(36).toUpperCase().slice(-6)}V`
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
      const { data: discarded, error } = await adminClient
        .from('internal_exam_codes')
        .delete()
        .eq('id', seededVictimCodeId)
        .select('id')
      if (error) {
        console.error(`[rpc-cross-tenant cleanup] code delete error: ${error.message}`)
      } else if ((discarded?.length ?? 0) > 0) {
        console.log(`[rpc-cross-tenant cleanup] removed ${discarded?.length} fixture code(s)`)
      }
    }
  })
})
