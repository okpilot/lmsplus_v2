/**
 * Red Team Spec: resent progress writes after the session ended (#1026 PR 2b) — Vector GT
 *
 * Surface: withReconnect (apps/web/app/app/quiz/session/_utils/with-reconnect.ts) resends
 * checkAnswer / saveQuizAnswer / saveQuizPosition after a network failure, so a resend can land
 * after another device ended the session. check_quiz_answer, save_quiz_answer and
 * save_quiz_position must refuse it: no grading payload, no progress row change.
 *
 * GT (race): the same calls that land on the open session are refused once ended_at is set.
 *
 * Status: Expected to PASS. The control arm proves each call writes on the open session.
 */

import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
import { clearOpenSessions } from './helpers/clear-open-sessions'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { E2E_REDTEAM_QP_MARKER } from './helpers/seed-markers'
import { seedRedTeamUsers, VICTIM_EMAIL, VICTIM_PASSWORD } from './helpers/seed-users'

type Client = Awaited<ReturnType<typeof createAuthenticatedClient>>

const DEVICE_A = '00000000-0000-4000-8000-0000000000c1'

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

test.describe('Red Team: progress resend after session end (Vector GT)', () => {
  let admin: ReturnType<typeof getAdminClient>
  let victim: Client
  let orgId: string
  let victimUserId: string
  let q1: string
  let q2: string

  const seedSession = async () => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: orgId,
        student_id: victimUserId,
        mode: 'quick_quiz',
        total_questions: 2,
        config: { question_ids: [q1, q2], e2e_marker: E2E_REDTEAM_QP_MARKER },
      })
      .select('id')
      .single()
    if (error || !isRecord(data) || typeof data.id !== 'string')
      throw new Error(`seedSession: ${error?.message ?? 'bad shape'}`)
    return data.id
  }

  const readProgress = async (sessionId: string) => {
    const { data, error } = await admin
      .from('quiz_session_progress')
      .select('question_id, answer')
      .eq('session_id', sessionId)
      .order('question_id')
    if (error) throw new Error(`readProgress: ${error.message}`)
    return data ?? []
  }

  const readPosition = async (sessionId: string) => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .select('current_index, ended_at')
      .eq('id', sessionId)
      .single()
    if (error || !data) throw new Error(`readPosition: ${error?.message}`)
    return data
  }

  const grade = (sessionId: string, option: string) =>
    victim.rpc('check_quiz_answer', {
      p_question_id: q1,
      p_selected_option_id: option,
      p_session_id: sessionId,
      p_device_id: DEVICE_A,
      p_time_spent_ms: 500,
    })

  const saveAnswer = (sessionId: string, option: string) =>
    victim.rpc('save_quiz_answer', {
      p_session_id: sessionId,
      p_question_id: q2,
      p_answer: { selected_option_id: option },
      p_time_spent_ms: 500,
      p_device_id: DEVICE_A,
    })

  const savePosition = (sessionId: string, index: number) =>
    victim.rpc('save_quiz_position', {
      p_session_id: sessionId,
      p_current_index: index,
      p_pinned_question_ids: [],
      p_device_id: DEVICE_A,
    })

  test.beforeAll(async () => {
    admin = getAdminClient()
    const seed = await seedRedTeamUsers()
    orgId = seed.orgId
    victimUserId = seed.victimUserId
    victim = await createAuthenticatedClient(VICTIM_EMAIL, VICTIM_PASSWORD)
    const { data, error } = await admin
      .from('questions')
      .select('id')
      .eq('organization_id', orgId)
      .eq('question_type', 'multiple_choice')
      .eq('status', 'active')
      .is('deleted_at', null)
      .not('correct_option_id', 'is', null)
      .order('id')
      .limit(2)
    if (error) throw new Error(`beforeAll questions: ${error.message}`)
    if (!Array.isArray(data) || data.length < 2) throw new Error('need 2 active MC questions')
    q1 = data[0]?.id as string
    q2 = data[1]?.id as string
  })

  test.beforeEach(async () => {
    await clearOpenSessions(admin, victimUserId, 'progress-late-resend')
  })

  test.afterEach(async () => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('config->>e2e_marker', E2E_REDTEAM_QP_MARKER)
      .is('deleted_at', null)
      .select('id')
    if (error) throw new Error(`afterEach: ${error.message}`)
    if ((data?.length ?? 0) > 0) console.info(`[progress-late-resend] soft-deleted ${data?.length}`)
  })

  test('GT: resent grade and saves landing after the session ended change nothing', async () => {
    const sessionId = await seedSession()
    const claim = await victim.rpc('claim_quiz_session', {
      p_session_id: sessionId,
      p_device_id: DEVICE_A,
    })
    expect(claim.error).toBeNull()

    // Control: on the open session each call lands.
    const ok = await grade(sessionId, 'a')
    expect(ok.error).toBeNull()
    expect(isRecord(ok.data) && typeof ok.data.correct_option_id === 'string').toBe(true)
    expect((await saveAnswer(sessionId, 'a')).error).toBeNull()
    expect((await savePosition(sessionId, 1)).error).toBeNull()
    const before = await readProgress(sessionId)
    expect(before).toEqual(
      [
        { question_id: q1, answer: { selected_option_id: 'a' } },
        { question_id: q2, answer: { selected_option_id: 'a' } },
      ].sort((x, y) => x.question_id.localeCompare(y.question_id)),
    )
    expect((await readPosition(sessionId)).current_index).toBe(1)

    // Another device ends the session.
    const { error: endErr } = await admin
      .from('quiz_sessions')
      .update({ ended_at: new Date().toISOString() })
      .eq('id', sessionId)
    if (endErr) throw new Error(`end session: ${endErr.message}`)
    expect((await readPosition(sessionId)).ended_at).not.toBeNull()

    const lateGrade = await grade(sessionId, 'b')
    expect(lateGrade.data).toBeNull()
    expect(lateGrade.error?.message).toBe('session not found or not owned by this student')
    expect((await saveAnswer(sessionId, 'b')).error?.message).toBe('session_ended')
    expect((await savePosition(sessionId, 0)).error?.message).toBe('session_ended')

    expect(await readProgress(sessionId)).toEqual(before)
    expect((await readPosition(sessionId)).current_index).toBe(1)
  })
})
