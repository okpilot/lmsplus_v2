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
import { pickSubjectWithQuestions } from './helpers/seed-quiz'
import { ATTACKER_EMAIL, ATTACKER_PASSWORD, seedRedTeamUsers } from './helpers/seed-users'

test.describe('Red Team: RPC Question Membership Check', () => {
  let attackerClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let adminClient: Awaited<ReturnType<typeof getAdminClient>>
  let orgId: string

  test.beforeAll(async () => {
    const seed = await seedRedTeamUsers()
    orgId = seed.orgId
    attackerClient = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)
    adminClient = getAdminClient()

    // Ensure at least 2 subjects exist for cross-subject injection testing
    const { data: existingSubjects, error: existingSubjectsErr } = await adminClient
      .from('easa_subjects')
      .select('id')
      .limit(2)
    if (existingSubjectsErr)
      throw new Error(`seed: easa_subjects lookup failed: ${existingSubjectsErr.message}`)

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
          const { data: org, error: orgErr } = await adminClient
            .from('organizations')
            .select('id')
            .eq('slug', 'egmont-aviation')
            .single()
          if (orgErr) throw new Error(`seed: org lookup failed: ${orgErr.message}`)

          const { data: bank, error: bankErr } = await adminClient
            .from('question_banks')
            .select('id')
            .eq('organization_id', org!.id)
            .limit(1)
            .single()
          if (bankErr) throw new Error(`seed: question_banks lookup failed: ${bankErr.message}`)

          const { data: user, error: userErr } = await adminClient
            .from('users')
            .select('id')
            .eq('role', 'admin')
            .limit(1)
            .single()
          if (userErr) throw new Error(`seed: users lookup failed: ${userErr.message}`)

          if (org && bank && user) {
            // Check if question already exists (can't use upsert — partial unique index)
            const { data: existing, error: existingErr } = await adminClient
              .from('questions')
              .select('id')
              .eq('bank_id', bank.id)
              .eq('question_number', 'RT-ALW-001')
              .is('deleted_at', null)
              .limit(1)
            if (existingErr)
              throw new Error(`seed: questions lookup failed: ${existingErr.message}`)

            if (!existing || existing.length === 0) {
              await adminClient.from('questions').insert({
                organization_id: org.id,
                bank_id: bank.id,
                question_number: 'RT-ALW-001',
                subject_id: subjectB.id,
                topic_id: topicB.id,
                question_text: 'ICAO is headquartered in:',
                correct_option_id: 'b',
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
    const { data: verifySubjects, error: verifySubjectsErr } = await adminClient
      .from('easa_subjects')
      .select('id')
      .limit(2)
    if (verifySubjectsErr)
      throw new Error(`seed: easa_subjects verify failed: ${verifySubjectsErr.message}`)
    expect(
      verifySubjects?.length,
      'Seed failed: need at least 2 subjects for membership check test',
    ).toBeGreaterThanOrEqual(2)
  })

  test('submit_quiz_answer rejects a question that does not belong to the session subject', async () => {
    // Step 1: Pick a subject A with at least one active question (deterministic).
    const subjectAPick = await pickSubjectWithQuestions(adminClient, { orgId })
    const subjectAId = subjectAPick.subjectId
    const topicAId = subjectAPick.topicId

    // Step 2: Find a different subject B that also has at least one active question.
    // easa_subjects is shared reference data (no organization_id, no deleted_at).
    // Org scoping is enforced by the per-subject question count below.
    const { data: allSubjects, error: allSubjectsErr } = await adminClient
      .from('easa_subjects')
      .select('id')
      .order('code', { ascending: true })
    expect(allSubjectsErr).toBeNull()
    expect(allSubjects).not.toBeNull()
    let subjectBId: string | null = null
    for (const s of allSubjects ?? []) {
      if (s.id === subjectAId) continue
      const { count } = await adminClient
        .from('questions')
        .select('id', { head: true, count: 'exact' })
        .eq('organization_id', orgId)
        .eq('subject_id', s.id)
        .eq('status', 'active')
        .is('deleted_at', null)
      if ((count ?? 0) >= 1) {
        subjectBId = s.id
        break
      }
    }
    expect(subjectBId, 'need a second subject with at least one active question').not.toBeNull()

    // Step 3: Attacker starts a session for subject A — fetch question IDs first
    const { data: questionsA, error: questionsAErr } = await adminClient
      .from('questions')
      .select('id')
      .eq('organization_id', orgId)
      .eq('subject_id', subjectAId)
      .eq('topic_id', topicAId)
      .eq('status', 'active')
      .is('deleted_at', null)
      .limit(5)
    expect(questionsAErr).toBeNull()
    const questionAIds = (questionsA ?? []).map((q) => q.id)

    const { data: sessionData, error: sessionError } = await attackerClient.rpc(
      'start_quiz_session',
      {
        p_mode: 'quick_quiz',
        p_subject_id: subjectAId,
        p_topic_id: topicAId,
        p_question_ids: questionAIds,
      },
    )

    expect(sessionError).toBeNull()
    expect(sessionData).not.toBeNull()

    // start_quiz_session returns a plain string (the session ID)
    const sessionId = sessionData as string

    expect(sessionId).toBeTruthy()

    // Step 4: Admin finds a question belonging to subject B (different subject)
    const { data: foreignQuestions, error: questionsError } = await adminClient
      .from('questions')
      .select('id, options')
      .eq('organization_id', orgId)
      .eq('subject_id', subjectBId!)
      .eq('status', 'active')
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
