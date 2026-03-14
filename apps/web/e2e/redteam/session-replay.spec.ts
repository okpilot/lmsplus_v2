/**
 * Red Team Spec 6 — Vector J (LOW): Session Replay
 *
 * Attack: Replay `batch_submit_quiz` on an already-completed session.
 * Goal: Inflate score by submitting a second (better) set of answers after completion.
 * Defense: RPC checks session status before accepting answers; completed sessions are terminal.
 */

import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { ATTACKER_EMAIL, ATTACKER_PASSWORD, seedRedTeamUsers } from './helpers/seed'

test.describe('Red Team: Session Replay', () => {
  let attackerClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let sessionId: string
  let subjectId: string
  let originalScore: number

  test.beforeAll(async () => {
    await seedRedTeamUsers()
    attackerClient = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)

    // Resolve a real subject_id to use for session creation
    const admin = getAdminClient()
    const { data: subject } = await admin.from('subjects').select('id').limit(1).single()
    subjectId = subject!.id
  })

  test('rejects batch_submit_quiz replay on completed session', async () => {
    // Step 1: Start a quiz session
    const { data: startData, error: startError } = await attackerClient.rpc('start_quiz_session', {
      p_subject_id: subjectId,
      p_question_count: 3,
    })
    expect(startError).toBeNull()
    expect(startData).toBeTruthy()
    sessionId = (startData as { session_id: string }).session_id

    // Step 2: Fetch questions for this session
    const { data: questions, error: questionsError } = await attackerClient.rpc(
      'get_quiz_questions',
      { p_session_id: sessionId },
    )
    expect(questionsError).toBeNull()
    expect(Array.isArray(questions)).toBe(true)
    expect((questions as unknown[]).length).toBeGreaterThan(0)

    type Question = { id: string; options: { id: string }[] }
    const typedQuestions = questions as Question[]

    // Step 3: Build first-round answers (pick first option for each question)
    const firstAnswers = typedQuestions.map((q) => ({
      question_id: q.id,
      selected_option: q.options[0]?.id ?? '',
      response_time_ms: 5000,
    }))

    // Step 4: Complete the session legitimately
    const { data: completeData, error: completeError } = await attackerClient.rpc(
      'complete_quiz_session',
      {
        p_session_id: sessionId,
        p_answers: firstAnswers,
      },
    )
    expect(completeError).toBeNull()
    originalScore = (completeData as { score: number })?.score ?? 0

    // Step 5: Replay batch_submit_quiz with a new set of answers on the completed session
    const replayAnswers = typedQuestions.map((q) => ({
      question_id: q.id,
      selected_option: q.options[q.options.length - 1]?.id ?? '', // pick last option instead
      response_time_ms: 1000,
    }))

    const { data: replayData, error: replayError } = await attackerClient.rpc('batch_submit_quiz', {
      p_session_id: sessionId,
      p_answers: replayAnswers,
    })

    // Step 6: RPC must reject — session is already completed
    expect(replayError).not.toBeNull()

    // Step 7: Verify score in DB did not change
    const admin = getAdminClient()
    const { data: sessionRow } = await admin
      .from('quiz_sessions')
      .select('score, status')
      .eq('id', sessionId)
      .single()

    expect(sessionRow?.status).toBe('completed')
    expect(sessionRow?.score).toBe(originalScore)

    // Confirm replay returned no usable data
    expect(replayData).toBeNull()
  })
})
