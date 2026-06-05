/**
 * Red Team Spec: quiz_sessions score forgery via direct UPDATE (#611, Vectors BL/BM/BN)
 *
 * A student tries to forge their own exam score by directly UPDATEing the scoring
 * columns of their active quiz_sessions row via PostgREST, bypassing batch_submit_quiz.
 *
 * Defense (migration 20260605000001): `authenticated` is REVOKEd blanket UPDATE on
 * quiz_sessions and re-GRANTed UPDATE on every non-scoring, non-PK column (the 10
 * config columns + deleted_at — 11 columns total). The config columns stay granted so
 * the `trg_quiz_sessions_immutable_columns` trigger still fires its 'immutable' message
 * for the #554 config-injection attack surface; deleted_at stays granted for the
 * discard path. The four scoring columns (correct_count, score_percentage, passed,
 * ended_at) and `id` are intentionally OMITTED, so a student-direct UPDATE touching any
 * of them fails with 42501 (permission denied for column …) at the privilege layer —
 * BEFORE RLS row filtering, so the rejection is non-vacuous. Completion runs through
 * SECURITY DEFINER RPCs (postgres-owned), which the authenticated column grant does not
 * touch.
 *
 * Status: Expected to PASS (defense should hold). A failing assertion means score forgery works.
 */

import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
import { createAuthenticatedClient } from './helpers/redteam-client'
import {
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  pickSubjectWithQuestions,
  seedRedTeamUsers,
} from './helpers/seed'

test.describe('Red Team: quiz_sessions Score Forgery (direct UPDATE)', () => {
  let attackerClient: Awaited<ReturnType<typeof createAuthenticatedClient>>
  let adminClient: ReturnType<typeof getAdminClient>
  let attackerUserId: string
  let orgId: string
  let sessionId: string

  test.beforeAll(async () => {
    const seed = await seedRedTeamUsers()
    attackerUserId = seed.attackerUserId
    orgId = seed.orgId
    adminClient = getAdminClient()
    attackerClient = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)

    // Start a real quick_quiz session OWNED BY THE ATTACKER so the forge attempts target
    // a row the student legitimately controls (active, ended_at IS NULL).
    const pick = await pickSubjectWithQuestions(adminClient, { orgId })
    const { data: qs, error: qErr } = await adminClient
      .from('questions')
      .select('id')
      .eq('organization_id', orgId)
      .eq('subject_id', pick.subjectId)
      .eq('topic_id', pick.topicId)
      .eq('status', 'active')
      .is('deleted_at', null)
      .limit(3)
    expect(qErr).toBeNull()
    const questionIds = (qs ?? []).map((q) => q.id)
    expect(questionIds.length).toBeGreaterThan(0)

    const { data: newSessionId, error: startErr } = await attackerClient.rpc('start_quiz_session', {
      p_mode: 'quick_quiz',
      p_subject_id: pick.subjectId,
      p_topic_id: pick.topicId,
      p_question_ids: questionIds,
    })
    expect(startErr).toBeNull()
    expect(typeof newSessionId).toBe('string')
    sessionId = newSessionId as string
  })

  test.afterAll(async () => {
    // Soft-delete the seeded attacker session (service role bypasses RLS). quiz_sessions
    // is soft-delete only (docs/database.md soft-delete matrix), matching the sibling
    // config-injection / cross-tenant specs. The positive-control test may already have
    // set deleted_at, in which case the `.is('deleted_at', null)` filter matches 0 rows —
    // a valid silent no-op (code-style.md §5).
    if (!sessionId) return
    const { data, error } = await adminClient
      .from('quiz_sessions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', sessionId)
      .is('deleted_at', null)
      .select('id')
    if (error) {
      console.error('[score-forgery cleanup] soft-delete failed:', error.message)
      throw new Error(`score-forgery cleanup failed: ${error.message}`)
    }
    if ((data?.length ?? 0) > 0) {
      console.log(`[score-forgery cleanup] soft-deleted ${data?.length} session(s)`)
    }
  })

  test('Vector BL (#611): a student cannot forge correct_count via direct UPDATE', async () => {
    const { error } = await attackerClient
      .from('quiz_sessions')
      .update({ correct_count: 999 })
      .eq('id', sessionId)
    expect(error).not.toBeNull()
    expect(error?.code).toBe('42501') // permission denied for column correct_count
  })

  test('Vector BM (#611): a student cannot forge score_percentage via direct UPDATE', async () => {
    const { error } = await attackerClient
      .from('quiz_sessions')
      .update({ score_percentage: 100 })
      .eq('id', sessionId)
    expect(error).not.toBeNull()
    expect(error?.code).toBe('42501')
  })

  test('Vector BN (#611): a student cannot forge passed via direct UPDATE', async () => {
    const { error } = await attackerClient
      .from('quiz_sessions')
      .update({ passed: true })
      .eq('id', sessionId)
    expect(error).not.toBeNull()
    expect(error?.code).toBe('42501')
  })

  test('a student cannot self-complete by forging ended_at via direct UPDATE', async () => {
    const { error } = await attackerClient
      .from('quiz_sessions')
      .update({ ended_at: new Date().toISOString() })
      .eq('id', sessionId)
    expect(error).not.toBeNull()
    expect(error?.code).toBe('42501')
  })

  test('no scoring column was mutated by any forge attempt', async () => {
    // Service-role read confirms every forge above was a no-op at the row level.
    const { data, error } = await adminClient
      .from('quiz_sessions')
      .select('correct_count, score_percentage, passed, ended_at')
      .eq('id', sessionId)
      .single<{
        correct_count: number
        score_percentage: number | null
        passed: boolean | null
        ended_at: string | null
      }>()
    expect(error).toBeNull()
    // start_quiz_session leaves a fresh session unscored and active.
    expect(data?.correct_count).toBe(0)
    expect(data?.score_percentage).toBeNull()
    expect(data?.passed).toBeNull()
    expect(data?.ended_at).toBeNull()
  })

  test('positive control: a student CAN soft-delete (discard) their own active session', async () => {
    // Proves the column GRANT is scoped, not block-all — deleted_at remains writable, so
    // the legitimate discardQuiz path still works (and the 42501s above are real privilege
    // blocks, not a table-wide REVOKE that would no-op every write).
    const { data, error } = await attackerClient
      .from('quiz_sessions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', sessionId)
      .eq('student_id', attackerUserId)
      .is('ended_at', null)
      .select('id')
    expect(error).toBeNull()
    expect(data?.length ?? 0).toBe(1)
  })
})
