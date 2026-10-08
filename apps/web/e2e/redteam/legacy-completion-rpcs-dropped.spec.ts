/**
 * Red Team Spec: legacy client-graded completion RPCs are gone (#1026 2e-b2b) — Vector HW
 *
 * Surface: mig 20261008000200 drops batch_submit_quiz, submit_vfr_rt_exam_answers,
 * complete_empty_exam_session and complete_quiz_session. finish_quiz_session is the only
 * student completion path; it grades server-saved progress and refuses a taken-over device.
 *
 * HW (sibling-guard-gap): a student whose exam was taken over by another device ends it through
 * a legacy RPC with client-supplied keyed answers, bypassing session_taken_over and
 * progress-only grading.
 *
 * Status: Expected to PASS. CONTROL: finish_quiz_session refuses the stale device and ends the
 * same session from the active device.
 */

import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
import { clearOpenSessions } from './helpers/clear-open-sessions'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { E2E_REDTEAM_LC_MARKER } from './helpers/seed-markers'
import { ATTACKER_EMAIL, ATTACKER_PASSWORD, seedRedTeamUsers } from './helpers/seed-users'

type Client = Awaited<ReturnType<typeof createAuthenticatedClient>>

const STALE_DEVICE = '22222222-2222-4222-8222-222222222222'
const ACTIVE_DEVICE = '33333333-3333-4333-8333-333333333333'

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

test.describe('Red Team: legacy completion RPCs dropped (Vector HW)', () => {
  let admin: ReturnType<typeof getAdminClient>
  let attacker: Client
  let orgId: string
  let attackerUserId: string
  let q1: string
  let q2: string
  let keys: Record<string, string>

  const seedTakenOverExam = async () => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: orgId,
        student_id: attackerUserId,
        mode: 'mock_exam',
        total_questions: 2,
        time_limit_seconds: 3600,
        active_device_id: ACTIVE_DEVICE,
        config: { question_ids: [q1, q2], e2e_marker: E2E_REDTEAM_LC_MARKER },
      })
      .select('id')
      .single()
    if (error || !isRecord(data) || typeof data.id !== 'string')
      throw new Error(`seedTakenOverExam: ${error?.message ?? 'bad shape'}`)
    return data.id
  }

  const readSession = async (sessionId: string) => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .select('ended_at, correct_count, score_percentage, deleted_at')
      .eq('id', sessionId)
      .single()
    if (error || !data) throw new Error(`readSession: ${error?.message}`)
    return data
  }

  const countAnswers = async (sessionId: string) => {
    const { count, error } = await admin
      .from('quiz_session_answers')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', sessionId)
    if (error) throw new Error(`countAnswers: ${error.message}`)
    return count ?? 0
  }

  test.beforeAll(async () => {
    admin = getAdminClient()
    const seed = await seedRedTeamUsers()
    orgId = seed.orgId
    attackerUserId = seed.attackerUserId
    attacker = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)
    const { data, error } = await admin
      .from('questions')
      .select('id, correct_option_id')
      .eq('organization_id', orgId)
      .eq('question_type', 'multiple_choice')
      .eq('status', 'active')
      .is('deleted_at', null)
      .not('correct_option_id', 'is', null)
      .order('id')
      .limit(2)
    if (error) throw new Error(`beforeAll questions: ${error.message}`)
    if (!Array.isArray(data) || data.length < 2) throw new Error('need 2 active MC questions')
    keys = {}
    for (const row of data) {
      if (typeof row.id !== 'string' || typeof row.correct_option_id !== 'string')
        throw new Error('beforeAll questions: bad row')
      keys[row.id] = row.correct_option_id
    }
    ;[q1, q2] = Object.keys(keys) as [string, string]
  })

  test.beforeEach(async () => {
    await clearOpenSessions(admin, attackerUserId, 'legacy-completion')
  })

  test.afterEach(async () => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('config->>e2e_marker', E2E_REDTEAM_LC_MARKER)
      .is('deleted_at', null)
      .select('id')
    if (error) throw new Error(`afterEach soft-delete sessions: ${error.message}`)
    if ((data?.length ?? 0) > 0) console.info(`[legacy-completion] soft-deleted ${data?.length}`)
  })

  test('HW: a taken-over exam cannot be ended through any legacy completion RPC', async () => {
    const sessionId = await seedTakenOverExam()
    const before = await readSession(sessionId)
    expect(before.ended_at).toBeNull()
    expect(before.deleted_at).toBeNull()

    const keyedMc = [q1, q2].map((qid) => ({
      question_id: qid,
      selected_option: keys[qid],
      response_time_ms: 1000,
    }))
    const keyedVfr = [q1, q2].map((qid) => ({ question_id: qid, selected_option_id: keys[qid] }))
    const probes: Array<[string, Record<string, unknown>]> = [
      ['batch_submit_quiz', { p_session_id: sessionId, p_answers: keyedMc }],
      ['submit_vfr_rt_exam_answers', { p_session_id: sessionId, p_answers: keyedVfr }],
      ['complete_empty_exam_session', { p_session_id: sessionId }],
      ['complete_quiz_session', { p_session_id: sessionId }],
    ]
    for (const [fn, args] of probes) {
      const r = await attacker.rpc(fn, args)
      expect(r.data, fn).toBeNull()
      expect(r.error?.code, fn).toBe('PGRST202')
    }
    expect(await readSession(sessionId)).toEqual(before)
    expect(await countAnswers(sessionId)).toBe(0)

    // CONTROL: the live path refuses the stale device, then ends the session from the active one.
    const stale = await attacker.rpc('finish_quiz_session', {
      p_session_id: sessionId,
      p_device_id: STALE_DEVICE,
    })
    expect(stale.data).toBeNull()
    expect(stale.error?.message).toContain('session_taken_over')
    expect((await readSession(sessionId)).ended_at).toBeNull()

    const live = await attacker.rpc('finish_quiz_session', {
      p_session_id: sessionId,
      p_device_id: ACTIVE_DEVICE,
    })
    expect(live.error).toBeNull()
    if (!isRecord(live.data)) throw new Error('finish_quiz_session: bad shape')
    expect(live.data.total_questions).toBe(2)
    expect(live.data.answered_count).toBe(0)
    expect(live.data.correct_count).toBe(0)
    expect((await readSession(sessionId)).ended_at).not.toBeNull()
  })
})
