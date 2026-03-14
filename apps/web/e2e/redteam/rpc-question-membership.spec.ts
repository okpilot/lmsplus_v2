/**
 * Red Team Spec: RPC Question Membership Check
 *
 * Vector A (HIGH): submit_quiz_answer accepts a foreign questionId that doesn't
 * belong to the session's subject. An attacker can start a session for subject A,
 * then submit answers referencing questions from subject B — bypassing the intended
 * quiz scope.
 *
 * Status: CONFIRMED GAP — migration fix not yet applied.
 * When fixed: remove test.fixme from the "rejects foreign question" test.
 */

import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { ATTACKER_EMAIL, ATTACKER_PASSWORD, seedRedTeamUsers } from './helpers/seed'

test.describe('Red Team: RPC Question Membership Check', () => {
  let attackerClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let adminClient: Awaited<ReturnType<typeof getAdminClient>>

  test.beforeAll(async () => {
    await seedRedTeamUsers()
    attackerClient = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)
    adminClient = getAdminClient()
  })

  // FIXME: This test documents the DESIRED behavior. Currently FAILS because
  // submit_quiz_answer lacks a question membership check. Remove test.fixme
  // when the migration fix is applied.
  test.fixme(
    'submit_quiz_answer rejects a question that does not belong to the session subject',
    async () => {
      // Step 1: Find two distinct subjects in the egmont-aviation org
      const { data: subjects, error: subjectsError } = await adminClient
        .from('easa_subjects')
        .select('id, name')
        .limit(2)

      expect(subjectsError).toBeNull()
      expect(subjects).not.toBeNull()
      expect(subjects!.length).toBeGreaterThanOrEqual(2)

      const subjectA = subjects![0]
      const subjectB = subjects![1]

      // Step 2: Attacker starts a session for subject A — fetch question IDs first
      const { data: topicsA } = await adminClient
        .from('easa_topics')
        .select('id')
        .eq('subject_id', subjectA.id)
        .limit(5)
      const topicAIds = (topicsA ?? []).map((t) => t.id)
      const topicAId = topicAIds[0] ?? subjectA.id

      const { data: questionsA } = await adminClient
        .from('questions')
        .select('id')
        .in('topic_id', topicAIds)
        .is('deleted_at', null)
        .limit(5)
      const questionAIds = (questionsA ?? []).map((q) => q.id)

      const { data: sessionData, error: sessionError } = await attackerClient.rpc(
        'start_quiz_session',
        {
          p_mode: 'quick_quiz',
          p_subject_id: subjectA.id,
          p_topic_id: topicAId,
          p_question_ids: questionAIds,
        },
      )

      expect(sessionError).toBeNull()
      expect(sessionData).not.toBeNull()

      // start_quiz_session returns a plain string (the session ID)
      const sessionId = sessionData as string

      expect(sessionId).toBeTruthy()

      // Step 3: Admin finds a question belonging to subject B (different subject)
      // Questions are linked to topics, topics to subjects.
      const { data: topicsB, error: topicsError } = await adminClient
        .from('easa_topics')
        .select('id')
        .eq('subject_id', subjectB.id)
        .limit(5)

      expect(topicsError).toBeNull()
      expect(topicsB).not.toBeNull()
      expect(topicsB!.length).toBeGreaterThan(0)

      const topicBIds = topicsB!.map((t) => t.id)

      const { data: foreignQuestions, error: questionsError } = await adminClient
        .from('questions')
        .select('id, options')
        .in('topic_id', topicBIds)
        .is('deleted_at', null)
        .limit(1)

      expect(questionsError).toBeNull()
      expect(foreignQuestions).not.toBeNull()
      expect(foreignQuestions!.length).toBeGreaterThan(0)

      const foreignQuestion = foreignQuestions![0]
      const foreignOptionId = (foreignQuestion.options as { id: string }[])[0].id

      // Step 4: Attacker submits the foreign question into the subject A session
      // EXPECTED (current behavior — GAP): RPC accepts it without a membership check.
      // EXPECTED (after fix): RPC should reject with an error or raise.
      const { data: submitData, error: submitError } = await attackerClient.rpc(
        'submit_quiz_answer',
        {
          p_session_id: sessionId,
          p_question_id: foreignQuestion.id,
          p_selected_option: foreignOptionId,
          p_response_time_ms: 3000,
        },
      )

      // --- GAP DEMONSTRATION ---
      // The assertion below reflects the DESIRED secure behavior.
      // Currently this test FAILS because the RPC accepts the foreign question.
      // Once the migration fix lands (question membership check), remove test.fixme.
      expect(
        submitError,
        'RPC should reject foreign question not in session subject',
      ).not.toBeNull()
      expect(submitData).toBeNull()
    },
  )
})
