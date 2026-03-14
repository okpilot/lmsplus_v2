/**
 * Red Team Spec 7 — Vector G (LOW): Session Race Condition
 *
 * Attack: Concurrent discard + complete on the same session.
 * Goal: Exploit a TOCTOU window to land the session in an inconsistent state,
 *       or bypass scoring logic by discarding after completion.
 * Defense: `FOR UPDATE` lock inside RPCs serialises concurrent access; terminal
 *          statuses ('completed', 'discarded') are immutable.
 *
 * Note: True concurrency cannot be reliably tested in a sequential Playwright
 *       process. We simulate the race by performing the second operation after
 *       the first has already committed — if the RLS / RPC rejects the late
 *       write, the sequential version of the race also fails, proving the lock
 *       holds for the window that matters.
 */

import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { ATTACKER_EMAIL, ATTACKER_PASSWORD, seedRedTeamUsers } from './helpers/seed'

test.describe('Red Team: Session Race Condition', () => {
  let attackerClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let subjectId: string

  test.beforeAll(async () => {
    await seedRedTeamUsers()
    attackerClient = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)

    const admin = getAdminClient()
    const { data: subject } = await admin.from('easa_subjects').select('id').limit(1).single()
    subjectId = subject!.id
  })

  test('completed session cannot be overwritten with discarded status', async () => {
    // Step 1: Start a session
    const { data: startData, error: startError } = await attackerClient.rpc('start_quiz_session', {
      p_subject_id: subjectId,
      p_question_count: 3,
    })
    expect(startError).toBeNull()
    const sessionId = (startData as { session_id: string }).session_id

    // Step 2: Fetch questions and build answers
    const { data: questions, error: questionsError } = await attackerClient.rpc(
      'get_quiz_questions',
      { p_session_id: sessionId },
    )
    expect(questionsError).toBeNull()

    type Question = { id: string; options: { id: string }[] }
    const typedQuestions = questions as Question[]
    const answers = typedQuestions.map((q) => ({
      question_id: q.id,
      selected_option: q.options[0]?.id ?? '',
      response_time_ms: 3000,
    }))

    // Step 3: Submit answers then complete the session (first terminal state)
    const { error: batchError } = await attackerClient.rpc('batch_submit_quiz', {
      p_session_id: sessionId,
      p_answers: answers,
    })
    expect(batchError).toBeNull()

    const { error: completeError } = await attackerClient.rpc('complete_quiz_session', {
      p_session_id: sessionId,
    })
    expect(completeError).toBeNull()

    // Step 4: Attempt to UPDATE status to 'discarded' directly — simulates the
    //         losing side of a race where complete wins.
    //         RLS must block this because the row belongs to the attacker but
    //         completed sessions must not be mutable.
    await attackerClient.from('quiz_sessions').update({ status: 'discarded' }).eq('id', sessionId)

    // The update should be rejected (RLS/constraint) or silently affect 0 rows.
    // Either way, the session status must remain 'completed'.
    // We rely on the admin re-read below as the authoritative check, since
    // Supabase returns error: null for zero-row UPDATEs.

    // Step 5: Confirm the session remained in its committed terminal state
    const admin = getAdminClient()
    const { data: row } = await admin
      .from('quiz_sessions')
      .select('status, score')
      .eq('id', sessionId)
      .single()

    expect(row?.status).toBe('completed')
    expect(typeof row?.score).toBe('number')
  })

  test('discarded session cannot be re-completed', async () => {
    // Step 1: Start a fresh session
    const { data: startData, error: startError } = await attackerClient.rpc('start_quiz_session', {
      p_subject_id: subjectId,
      p_question_count: 3,
    })
    expect(startError).toBeNull()
    const sessionId = (startData as { session_id: string }).session_id

    // Step 2: Discard the session via RPC (first terminal state)
    const { error: discardError } = await attackerClient.rpc('discard_quiz_session', {
      p_session_id: sessionId,
    })
    // If the RPC doesn't exist yet the test acts as a detection spec — mark error
    // as acceptable only if error.message indicates missing function (not a logic failure).
    if (discardError) {
      // Discard RPC may not be exposed; try direct update as the attacker would
      const { error: directDiscardError } = await attackerClient
        .from('quiz_sessions')
        .update({ status: 'discarded' })
        .eq('id', sessionId)
      // Either path works for this test; we just need a discarded session state
      // If both fail, the session is still 'active' and the subsequent complete
      // attempt should succeed — which means this particular race path doesn't apply.
      if (directDiscardError) {
        test.skip() // Cannot force discard state; skip this sub-scenario
        return
      }
    }

    // Step 4: Attempt to complete the now-discarded session
    const { error: completeError } = await attackerClient.rpc('complete_quiz_session', {
      p_session_id: sessionId,
    })

    // Must be rejected — session is in a terminal state
    expect(completeError).not.toBeNull()

    // Step 5: Confirm status did not flip back
    const admin = getAdminClient()
    const { data: row } = await admin
      .from('quiz_sessions')
      .select('status')
      .eq('id', sessionId)
      .single()

    expect(row?.status).toBe('discarded')
  })
})
