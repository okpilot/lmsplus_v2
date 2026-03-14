/**
 * Red Team Spec: RPC Question Membership Check
 *
 * Vector A (HIGH): submit_quiz_answer accepts a foreign questionId that doesn't
 * belong to the session's subject. An attacker can start a session for subject A,
 * then submit answers referencing questions from subject B — bypassing the intended
 * quiz scope.
 *
 * Status: FIXED — migration 033 (submit_answer_membership_check.sql) added the
 * membership check to submit_quiz_answer. The RPC now rejects foreign questions.
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

    // Ensure at least 2 subjects exist for cross-subject injection testing
    const { data: existingSubjects } = await adminClient.from('easa_subjects').select('id').limit(2)

    if (!existingSubjects || existingSubjects.length < 2) {
      // Seed a second subject + topic + question for the membership check test
      const { data: subjectB } = await adminClient
        .from('easa_subjects')
        .upsert(
          { code: '010', name: 'Air Law', short: 'ALW', sort_order: 100 },
          { onConflict: 'code' },
        )
        .select('id')
        .single()

      if (subjectB) {
        const { data: topicB } = await adminClient
          .from('easa_topics')
          .upsert(
            { subject_id: subjectB.id, code: '010-01', name: 'International law', sort_order: 1 },
            { onConflict: 'subject_id,code' },
          )
          .select('id')
          .single()

        if (topicB) {
          const { data: org } = await adminClient
            .from('organizations')
            .select('id')
            .eq('slug', 'egmont-aviation')
            .single()

          const { data: bank } = await adminClient
            .from('question_banks')
            .select('id')
            .eq('organization_id', org!.id)
            .limit(1)
            .single()

          const { data: user } = await adminClient
            .from('users')
            .select('id')
            .eq('role', 'admin')
            .limit(1)
            .single()

          if (org && bank && user) {
            // Check if question already exists (can't use upsert — partial unique index)
            const { data: existing } = await adminClient
              .from('questions')
              .select('id')
              .eq('bank_id', bank.id)
              .eq('question_number', 'RT-ALW-001')
              .is('deleted_at', null)
              .limit(1)

            if (!existing || existing.length === 0) {
              await adminClient.from('questions').insert({
                organization_id: org.id,
                bank_id: bank.id,
                question_number: 'RT-ALW-001',
                subject_id: subjectB.id,
                topic_id: topicB.id,
                question_text: 'ICAO is headquartered in:',
                options: [
                  { id: 'a', text: 'Geneva', correct: false },
                  { id: 'b', text: 'Montreal', correct: true },
                  { id: 'c', text: 'Paris', correct: false },
                  { id: 'd', text: 'New York', correct: false },
                ],
                explanation_text: 'ICAO HQ is in Montreal, Canada.',
                difficulty: 'medium',
                status: 'active',
                created_by: user.id,
              })
            }
          }
        }
      }
    }

    // Verify seed succeeded — fail fast with a clear message instead of a cryptic assertion later
    const { data: verifySubjects } = await adminClient.from('easa_subjects').select('id').limit(2)
    expect(
      verifySubjects?.length,
      'Seed failed: need at least 2 subjects for membership check test',
    ).toBeGreaterThanOrEqual(2)
  })

  test('submit_quiz_answer rejects a question that does not belong to the session subject', async () => {
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
    // EXPECTED: RPC rejects with an error (membership check added in migration 033).
    const { data: submitData, error: submitError } = await attackerClient.rpc(
      'submit_quiz_answer',
      {
        p_session_id: sessionId,
        p_question_id: foreignQuestion.id,
        p_selected_option: foreignOptionId,
        p_response_time_ms: 3000,
      },
    )

    // Migration 033 added the membership check — RPC now rejects foreign questions.
    expect(submitError, 'RPC should reject foreign question not in session subject').not.toBeNull()
    expect(submitData).toBeNull()
  })
})
