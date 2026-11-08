/**
 * Red Team Spec — Vectors LE, LD (mig 20261108000100 dropped submit_quiz_answer and
 * get_student_profile_stats).
 *
 * LE (input-injection): check_quiz_answer.p_selected_option_id is the surviving MC text parameter
 *     (retired BQ fuzzed submit_quiz_answer.p_selected_option). Every SQL-fragment payload must
 *     raise invalid_answer and save no progress row. CONTROL: option 'a' grades and saves.
 * LD (auth-bypass): the dropped RPCs are unreachable for an authenticated student (PGRST202).
 *     CONTROL: the same client calls a live sibling RPC (get_student_streak) without error.
 *
 * Status: Expected to PASS.
 */

import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
import { clearOpenSessions } from './helpers/clear-open-sessions'
import { DB_LAYER_PAYLOADS, TRANSPORT_LAYER_PAYLOADS } from './helpers/payloads'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { E2E_REDTEAM_CQA_INJ_MARKER } from './helpers/seed-markers'
import { ATTACKER_EMAIL, ATTACKER_PASSWORD, seedRedTeamUsers } from './helpers/seed-users'

type Client = Awaited<ReturnType<typeof createAuthenticatedClient>>

const ZERO_UUID = '00000000-0000-0000-0000-000000000000'
const DEVICE = '00000000-0000-4000-8000-00000000001c'

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

test.describe('Red Team: check_quiz_answer option injection + dropped RPCs (LE, LD)', () => {
  let admin: ReturnType<typeof getAdminClient>
  let student: Client
  let orgId: string
  let studentId: string
  let q1: string
  let q2: string

  const seedSession = async (): Promise<string> => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: orgId,
        student_id: studentId,
        mode: 'quick_quiz',
        total_questions: 2,
        config: { question_ids: [q1, q2], e2e_marker: E2E_REDTEAM_CQA_INJ_MARKER },
      })
      .select('id')
      .single()
    if (error || !isRecord(data) || typeof data.id !== 'string')
      throw new Error(`seedSession: ${error?.message ?? 'bad shape'}`)
    return data.id
  }

  const progressRows = async (sessionId: string) => {
    const { data, error } = await admin
      .from('quiz_session_progress')
      .select('question_id, answer')
      .eq('session_id', sessionId)
    if (error) throw new Error(`progressRows: ${error.message}`)
    return data ?? []
  }

  test.beforeAll(async () => {
    admin = getAdminClient()
    const seed = await seedRedTeamUsers()
    orgId = seed.orgId
    studentId = seed.attackerUserId
    student = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)
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
    await clearOpenSessions(admin, studentId, 'lc')
  })

  test.afterEach(async () => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('config->>e2e_marker', E2E_REDTEAM_CQA_INJ_MARKER)
      .is('deleted_at', null)
      .select('id')
    if (error) throw new Error(`afterEach: ${error.message}`)
    if ((data?.length ?? 0) > 0) console.info(`[lc] soft-deleted ${data?.length}`)
  })

  test('LE control: a legitimate option grades and saves progress', async () => {
    const sessionId = await seedSession()
    const ok = await student.rpc('check_quiz_answer', {
      p_question_id: q1,
      p_selected_option_id: 'a',
      p_session_id: sessionId,
      p_device_id: DEVICE,
      p_time_spent_ms: 500,
    })
    expect(ok.error).toBeNull()
    expect(isRecord(ok.data) && typeof ok.data.correct_option_id === 'string').toBe(true)
    expect(await progressRows(sessionId)).toEqual([
      { question_id: q1, answer: { selected_option_id: 'a' } },
    ])
  })

  for (const payload of DB_LAYER_PAYLOADS) {
    test(`LE: SQL-fragment p_selected_option_id (${payload.name}) raises invalid_answer, saves nothing`, async () => {
      const sessionId = await seedSession()
      const { data, error } = await student.rpc('check_quiz_answer', {
        p_question_id: q1,
        p_selected_option_id: payload.value,
        p_session_id: sessionId,
        p_device_id: DEVICE,
        p_time_spent_ms: 500,
      })
      expect(data).toBeNull()
      expect(error?.message).toBe('invalid_answer')
      expect(await progressRows(sessionId)).toEqual([])
    })
  }

  for (const payload of TRANSPORT_LAYER_PAYLOADS) {
    test(`LE: control-character p_selected_option_id (${payload.name}) is refused, saves nothing`, async () => {
      const sessionId = await seedSession()
      const { data, error } = await student.rpc('check_quiz_answer', {
        p_question_id: q1,
        p_selected_option_id: payload.value,
        p_session_id: sessionId,
        p_device_id: DEVICE,
        p_time_spent_ms: 500,
      })
      expect(data).toBeNull()
      expect(error).not.toBeNull()
      expect(await progressRows(sessionId)).toEqual([])
    })
  }

  test('LD: dropped submit_quiz_answer and get_student_profile_stats are unreachable', async () => {
    const sessionId = await seedSession()

    const live = await student.rpc('get_student_streak')
    expect(live.error).toBeNull()

    const submit = await student.rpc('submit_quiz_answer', {
      p_session_id: sessionId,
      p_question_id: q1,
      p_selected_option: 'a',
      p_response_time_ms: 1000,
    })
    expect(submit.data).toBeNull()
    expect(submit.error?.code).toBe('PGRST202')

    const profile = await student.rpc('get_student_profile_stats')
    expect(profile.data).toBeNull()
    expect(profile.error?.code).toBe('PGRST202')

    const zero = await student.rpc('submit_quiz_answer', {
      p_session_id: ZERO_UUID,
      p_question_id: ZERO_UUID,
      p_selected_option: 'a',
      p_response_time_ms: 1000,
    })
    expect(zero.error?.code).toBe('PGRST202')

    const { count, error } = await admin
      .from('student_responses')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', sessionId)
    if (error) throw new Error(`student_responses count: ${error.message}`)
    expect(count).toBe(0)
  })
})
