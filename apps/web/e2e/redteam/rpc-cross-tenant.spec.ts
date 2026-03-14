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
import { createCrossOrgUser, seedRedTeamUsers } from './helpers/seed'

test.describe('Red Team: Cross-Tenant RPC Isolation', () => {
  let crossOrgClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let adminClient: Awaited<ReturnType<typeof getAdminClient>>
  let egmontSubjectId: string

  test.beforeAll(async () => {
    await seedRedTeamUsers()
    const crossOrgUser = await createCrossOrgUser()
    crossOrgClient = await createAuthenticatedClient(crossOrgUser.email, crossOrgUser.password)
    adminClient = getAdminClient()

    // Resolve a real subject from egmont-aviation for use in attack vectors
    const { data: subjects, error } = await adminClient.from('subjects').select('id').limit(1)

    expect(error).toBeNull()
    expect(subjects).not.toBeNull()
    expect(subjects!.length).toBeGreaterThan(0)

    egmontSubjectId = subjects![0].id
  })

  test('cross-org user cannot start a quiz session for an egmont-aviation subject', async () => {
    // Attack: use a known egmont-aviation subject_id in start_quiz_session.
    // RLS on the questions/subjects tables should cause the RPC to find 0 questions,
    // resulting in an error or an empty session.
    const { data, error } = await crossOrgClient.rpc('start_quiz_session', {
      p_subject_id: egmontSubjectId,
      p_question_count: 5,
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
        .from('topics')
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

  test('cross-org user cannot read egmont-aviation student_progress', async () => {
    const { data: progress, error } = await crossOrgClient
      .from('student_progress')
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
})
