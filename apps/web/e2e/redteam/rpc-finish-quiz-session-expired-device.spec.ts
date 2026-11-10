/**
 * Red Team Spec: finish_quiz_session device check vs expiry (#1753) — Vectors LV, LW
 *
 * Surface: finish_quiz_session(p_session_id, p_device_id) (mig 20261110000400) skips the
 * session_taken_over check once now() > started_at + time_limit_seconds + 30 s.
 *
 * LV (auth-bypass): a non-claiming device forges expiry (UPDATE started_at / time_limit_seconds on
 *   its own live session) to skip the device check.
 * LW (timing): a non-claiming device finishes a timed session past its limit but inside the 30 s grace.
 *
 * Status: Expected to PASS. Each test carries a control arm: a genuinely expired session finishes
 * from the non-claiming device.
 */

import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
import { clearOpenSessions } from './helpers/clear-open-sessions'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { E2E_REDTEAM_ED_MARKER } from './helpers/seed-markers'
import { seedRedTeamUsers, VICTIM_EMAIL, VICTIM_PASSWORD } from './helpers/seed-users'

type Client = Awaited<ReturnType<typeof createAuthenticatedClient>>

const DEVICE_A = '00000000-0000-4000-8000-0000000000ea'
const DEVICE_B = '00000000-0000-4000-8000-0000000000eb'
const LIMIT_S = 60

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

test.describe('Red Team: finish_quiz_session expired-session device check (Vectors LV, LW)', () => {
  let admin: ReturnType<typeof getAdminClient>
  let victim: Client
  let orgId: string
  let victimUserId: string
  let q1: string
  let q2: string
  let q1Key: string

  const secondsAgo = (s: number) => new Date(Date.now() - s * 1000).toISOString()

  const seedClaimedExam = async (startedAt: string) => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: orgId,
        student_id: victimUserId,
        mode: 'mock_exam',
        total_questions: 2,
        time_limit_seconds: LIMIT_S,
        started_at: secondsAgo(0),
        config: { question_ids: [q1, q2], e2e_marker: E2E_REDTEAM_ED_MARKER },
      })
      .select('id')
      .single()
    if (error || !isRecord(data) || typeof data.id !== 'string')
      throw new Error(`seedClaimedExam: ${error?.message ?? 'bad shape'}`)
    const sessionId = data.id
    const claim = await victim.rpc('claim_quiz_session', {
      p_session_id: sessionId,
      p_device_id: DEVICE_A,
    })
    if (claim.error) throw new Error(`claim: ${claim.error.message}`)
    const saved = await victim.rpc('save_quiz_answer', {
      p_session_id: sessionId,
      p_question_id: q1,
      p_answer: { selected_option_id: q1Key },
      p_time_spent_ms: 1000,
      p_device_id: DEVICE_A,
    })
    if (saved.error) throw new Error(`save: ${saved.error.message}`)
    const back = await admin
      .from('quiz_sessions')
      .update({ started_at: startedAt })
      .eq('id', sessionId)
      .select('id')
    if (back.error || back.data?.length !== 1) throw new Error(`backdate: ${back.error?.message}`)
    return sessionId
  }

  const readSession = async (sessionId: string) => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .select('ended_at, started_at, time_limit_seconds, active_device_id')
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

  const finish = (sessionId: string, device: string | null) =>
    victim.rpc('finish_quiz_session', { p_session_id: sessionId, p_device_id: device })

  const expectFinishedExpired = async (sessionId: string, device: string | null) => {
    const r = await finish(sessionId, device)
    expect(r.error).toBeNull()
    const out = r.data
    if (!isRecord(out)) throw new Error('finish: bad shape')
    expect(out.expired).toBe(true)
    expect(out.total_questions).toBe(2)
    expect(Number(out.answered_count)).toBe(1)
    expect(Number(out.correct_count)).toBe(1)
    expect(Number(out.score_percentage)).toBe(50)
    expect(out.passed).toBe(false)
    expect((await readSession(sessionId)).ended_at).not.toBeNull()
    expect(await countAnswers(sessionId)).toBe(1)
  }

  test.beforeAll(async () => {
    admin = getAdminClient()
    const seed = await seedRedTeamUsers()
    orgId = seed.orgId
    victimUserId = seed.victimUserId
    victim = await createAuthenticatedClient(VICTIM_EMAIL, VICTIM_PASSWORD)
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
    q1 = data[0]?.id as string
    q2 = data[1]?.id as string
    q1Key = data[0]?.correct_option_id as string
  })

  test.beforeEach(async () => {
    await clearOpenSessions(admin, victimUserId, 'finish-expired-device')
  })

  test.afterEach(async () => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('config->>e2e_marker', E2E_REDTEAM_ED_MARKER)
      .is('deleted_at', null)
      .select('id')
    if (error) throw new Error(`afterEach: ${error.message}`)
    if ((data?.length ?? 0) > 0)
      console.info(`[finish-expired-device] soft-deleted ${data?.length}`)
  })

  test('LV: a non-claiming device cannot forge expiry to skip the device check', async () => {
    const sessionId = await seedClaimedExam(secondsAgo(1))
    const before = await readSession(sessionId)
    expect(before.active_device_id).toBe(DEVICE_A)

    const forgeries: Record<string, unknown>[] = [
      { started_at: '2000-01-01T00:00:00Z' },
      { time_limit_seconds: 0 },
      { started_at: '2000-01-01T00:00:00Z', time_limit_seconds: 0 },
    ]
    for (const patch of forgeries) {
      const u = await victim.from('quiz_sessions').update(patch).eq('id', sessionId).select('id')
      expect(u.error, JSON.stringify(patch)).not.toBeNull()
    }
    const after = await readSession(sessionId)
    expect(after.started_at).toBe(before.started_at)
    expect(after.time_limit_seconds).toBe(LIMIT_S)

    for (const device of [DEVICE_B, null]) {
      const r = await finish(sessionId, device)
      expect(r.data).toBeNull()
      expect(r.error?.message).toBe('session_taken_over')
    }
    expect((await readSession(sessionId)).ended_at).toBeNull()
    expect(await countAnswers(sessionId)).toBe(0)

    // Control: a genuinely expired claimed session finishes from the non-claiming device.
    await clearOpenSessions(admin, victimUserId, 'finish-expired-device')
    const expiredId = await seedClaimedExam(secondsAgo(LIMIT_S + 120))
    await expectFinishedExpired(expiredId, DEVICE_B)
  })

  test('LW: a non-claiming device cannot finish inside the 30 s grace', async () => {
    const sessionId = await seedClaimedExam(secondsAgo(LIMIT_S + 10))

    for (const device of [DEVICE_B, null]) {
      const r = await finish(sessionId, device)
      expect(r.data).toBeNull()
      expect(r.error?.message).toBe('session_taken_over')
    }
    expect((await readSession(sessionId)).ended_at).toBeNull()
    expect(await countAnswers(sessionId)).toBe(0)

    // Control: past the grace, the same caller and device finish it, flagged expired.
    await clearOpenSessions(admin, victimUserId, 'finish-expired-device')
    const expiredId = await seedClaimedExam(secondsAgo(LIMIT_S + 45))
    await expectFinishedExpired(expiredId, DEVICE_B)
  })
})
