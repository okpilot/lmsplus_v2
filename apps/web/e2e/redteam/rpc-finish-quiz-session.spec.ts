/**
 * Red Team Spec: finish_quiz_session grades saved progress (#1026 PR 2c) — Vectors GU-GZ
 *
 * Surface: finish_quiz_session(p_session_id, p_device_id) (mig 20261004000300) and its helpers
 * _grade_session_progress / _score_graded_session (migs 20261004000100 / 000200).
 *
 * GU (idor): attacker finishes the victim's session.
 * GV (auth-bypass): a taken-over device finishes the session.
 * GW (race): concurrent finishes grade and audit once.
 * GX (soft-delete-bypass): a discarded or saved session is finished.
 * GY (answer-oracle): a progress row for a question outside config.question_ids is graded and keyed.
 * GZ (race): an answer sent after the deadline grace is graded at finish.
 *
 * Status: Expected to PASS. Each test carries a control arm proving the guarded effect occurs for
 * the legitimate caller.
 */

import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
import { clearOpenSessions } from './helpers/clear-open-sessions'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { E2E_REDTEAM_QF_MARKER } from './helpers/seed-markers'
import {
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  seedRedTeamUsers,
  VICTIM_EMAIL,
  VICTIM_PASSWORD,
} from './helpers/seed-users'

type Client = Awaited<ReturnType<typeof createAuthenticatedClient>>
type Mode = 'quick_quiz' | 'mock_exam'

const DEVICE_A = '00000000-0000-4000-8000-0000000000fa'
const DEVICE_B = '00000000-0000-4000-8000-0000000000fb'

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

const resultIds = (data: unknown): string[] => {
  if (!isRecord(data) || !Array.isArray(data.results)) throw new Error('finish: bad shape')
  return data.results.map((r) => (isRecord(r) ? String(r.question_id) : '')).sort()
}

test.describe('Red Team: finish_quiz_session (Vectors GU-GZ)', () => {
  let admin: ReturnType<typeof getAdminClient>
  let attacker: Client
  let victim: Client
  let orgId: string
  let attackerUserId: string
  let victimUserId: string
  let q1: string
  let q2: string
  let q3: string
  let q1Key: string

  const clearActive = (studentId: string) => clearOpenSessions(admin, studentId, 'finish-quiz')

  const seedSession = async (
    studentId: string,
    mode: Mode,
    opts: { timeLimit?: number; startedAt?: string } = {},
  ) => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: orgId,
        student_id: studentId,
        mode,
        total_questions: 2,
        time_limit_seconds: opts.timeLimit ?? (mode === 'mock_exam' ? 3600 : null),
        ...(opts.startedAt ? { started_at: opts.startedAt } : {}),
        config: { question_ids: [q1, q2], e2e_marker: E2E_REDTEAM_QF_MARKER },
      })
      .select('id')
      .single()
    if (error || !isRecord(data) || typeof data.id !== 'string')
      throw new Error(`seedSession(${mode}): ${error?.message ?? 'bad shape'}`)
    return data.id
  }

  const readSession = async (sessionId: string) => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .select('ended_at, deleted_at, saved_at, correct_count, score_percentage')
      .eq('id', sessionId)
      .single()
    if (error || !data) throw new Error(`readSession: ${error?.message}`)
    return data
  }

  const countRows = async (table: 'quiz_session_answers' | 'student_responses', id: string) => {
    const { count, error } = await admin
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('session_id', id)
    if (error) throw new Error(`countRows(${table}): ${error.message}`)
    return count ?? 0
  }

  const countTerminalAudits = async (sessionId: string) => {
    const { data, error } = await admin
      .from('audit_events')
      .select('event_type')
      .eq('resource_type', 'quiz_session')
      .eq('resource_id', sessionId)
    if (error) throw new Error(`countTerminalAudits: ${error.message}`)
    return (data ?? []).filter((e) => /\.(completed|expired|batch_submitted)$/.test(e.event_type))
      .length
  }

  const save = (c: Client, sessionId: string, qid: string, opt: string, device: string | null) =>
    c.rpc('save_quiz_answer', {
      p_session_id: sessionId,
      p_question_id: qid,
      p_answer: { selected_option_id: opt },
      p_time_spent_ms: 1000,
      p_device_id: device,
    })

  const finish = (c: Client, sessionId: string, device: string | null) =>
    c.rpc('finish_quiz_session', { p_session_id: sessionId, p_device_id: device })

  test.beforeAll(async () => {
    admin = getAdminClient()
    const seed = await seedRedTeamUsers()
    orgId = seed.orgId
    attackerUserId = seed.attackerUserId
    victimUserId = seed.victimUserId
    attacker = await createAuthenticatedClient(ATTACKER_EMAIL, ATTACKER_PASSWORD)
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
      .limit(3)
    if (error) throw new Error(`beforeAll questions: ${error.message}`)
    if (!Array.isArray(data) || data.length < 3) throw new Error('need 3 active MC questions')
    q1 = data[0]?.id as string
    q2 = data[1]?.id as string
    q3 = data[2]?.id as string
    q1Key = data[0]?.correct_option_id as string
  })

  test.beforeEach(async () => {
    await clearActive(victimUserId)
    await clearActive(attackerUserId)
  })

  test.afterEach(async () => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('config->>e2e_marker', E2E_REDTEAM_QF_MARKER)
      .is('deleted_at', null)
      .select('id')
    if (error) throw new Error(`afterEach: ${error.message}`)
    if ((data?.length ?? 0) > 0) console.info(`[finish-quiz] soft-deleted ${data?.length}`)
  })

  test('GU: attacker cannot finish the victim session', async () => {
    const sessionId = await seedSession(victimUserId, 'mock_exam')
    expect((await save(victim, sessionId, q1, q1Key, null)).error).toBeNull()

    const atk = await finish(attacker, sessionId, null)
    expect(atk.data).toBeNull()
    expect(atk.error?.message).toBe('session_not_found')
    expect((await readSession(sessionId)).ended_at).toBeNull()
    expect(await countRows('quiz_session_answers', sessionId)).toBe(0)

    // Control: the owner's finish grades the saved answer.
    const own = await finish(victim, sessionId, null)
    expect(own.error).toBeNull()
    expect(resultIds(own.data)).toEqual([q1])
    expect((own.data as Record<string, unknown>).correct_count).toBe(1)
    expect((await readSession(sessionId)).ended_at).not.toBeNull()
  })

  test('GV: a taken-over device cannot finish the session', async () => {
    const sessionId = await seedSession(victimUserId, 'quick_quiz')
    const claim = await victim.rpc('claim_quiz_session', {
      p_session_id: sessionId,
      p_device_id: DEVICE_A,
    })
    expect(claim.error).toBeNull()
    expect((await save(victim, sessionId, q1, q1Key, DEVICE_A)).error).toBeNull()

    for (const device of [DEVICE_B, null]) {
      const r = await finish(victim, sessionId, device)
      expect(r.data).toBeNull()
      expect(r.error?.message).toBe('session_taken_over')
    }
    expect((await readSession(sessionId)).ended_at).toBeNull()
    expect(await countRows('quiz_session_answers', sessionId)).toBe(0)

    // Control: the claiming device finishes.
    const ok = await finish(victim, sessionId, DEVICE_A)
    expect(ok.error).toBeNull()
    expect(resultIds(ok.data)).toEqual([q1])
  })

  test('GW: concurrent finishes grade and audit exactly once', async () => {
    const sessionId = await seedSession(victimUserId, 'mock_exam')
    expect((await save(victim, sessionId, q1, q1Key, null)).error).toBeNull()
    const wrong = q1Key === 'a' ? 'b' : 'a'
    expect((await save(victim, sessionId, q2, wrong, null)).error).toBeNull()

    const results = await Promise.all([0, 1, 2, 3].map(() => finish(victim, sessionId, null)))
    for (const r of results) {
      expect(r.error).toBeNull()
      expect(resultIds(r.data)).toEqual([q1, q2].sort())
      const d = r.data as Record<string, unknown>
      expect(d.answered_count).toBe(2)
      expect(d.total_questions).toBe(2)
    }
    const scores = results.map((r) => Number((r.data as Record<string, unknown>).score_percentage))
    expect(new Set(scores).size).toBe(1)
    expect(await countRows('quiz_session_answers', sessionId)).toBe(2)
    expect(await countRows('student_responses', sessionId)).toBe(2)
    expect(await countTerminalAudits(sessionId)).toBe(1)
  })

  test('GX: a discarded or saved session cannot be finished', async () => {
    // Control: an open session finishes.
    const openId = await seedSession(victimUserId, 'quick_quiz')
    expect((await save(victim, openId, q1, q1Key, null)).error).toBeNull()
    expect((await finish(victim, openId, null)).error).toBeNull()

    const discardedId = await seedSession(victimUserId, 'quick_quiz')
    expect((await save(victim, discardedId, q1, q1Key, null)).error).toBeNull()
    const del = await admin
      .from('quiz_sessions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', discardedId)
      .select('id')
    expect(del.error).toBeNull()
    expect(del.data).toHaveLength(1)
    const d = await finish(victim, discardedId, null)
    expect(d.data).toBeNull()
    expect(d.error?.message).toBe('session_discarded')
    expect((await readSession(discardedId)).ended_at).toBeNull()
    expect(await countRows('quiz_session_answers', discardedId)).toBe(0)

    const savedId = await seedSession(victimUserId, 'quick_quiz')
    expect((await save(victim, savedId, q1, q1Key, null)).error).toBeNull()
    const saved = await victim.rpc('save_quiz_for_later', {
      p_session_id: savedId,
      p_device_id: null,
    })
    expect(saved.error).toBeNull()
    try {
      expect((await readSession(savedId)).saved_at).not.toBeNull()
      const s = await finish(victim, savedId, null)
      expect(s.data).toBeNull()
      expect(s.error?.message).toBe('session_saved')
      expect((await readSession(savedId)).ended_at).toBeNull()
      expect(await countRows('quiz_session_answers', savedId)).toBe(0)
    } finally {
      const { error } = await victim.rpc('discard_saved_quiz', { p_session_id: savedId })
      if (error) console.error(`[finish-quiz] discard_saved_quiz: ${error.message}`)
    }
  })

  test('GY: a planted out-of-session progress row is neither graded nor keyed', async () => {
    const sessionId = await seedSession(victimUserId, 'mock_exam')
    expect((await save(victim, sessionId, q1, q1Key, null)).error).toBeNull()

    // The RPC path refuses the foreign question.
    const viaRpc = await save(victim, sessionId, q3, 'a', null)
    expect(viaRpc.error?.message).toBe('question_not_in_session')

    // Service-role plant simulates a write-path regression.
    const plant = await admin
      .from('quiz_session_progress')
      .insert({
        session_id: sessionId,
        question_id: q3,
        student_id: victimUserId,
        answer: { selected_option_id: 'a' },
      })
      .select('question_id')
    expect(plant.error).toBeNull()
    expect(plant.data).toHaveLength(1)

    const r = await finish(victim, sessionId, null)
    expect(r.error).toBeNull()
    // Control: the in-session answer is graded and keyed.
    expect(resultIds(r.data)).toEqual([q1])
    expect(JSON.stringify(r.data)).not.toContain(q3)
    const { data: rows, error } = await admin
      .from('quiz_session_answers')
      .select('question_id')
      .eq('session_id', sessionId)
    expect(error).toBeNull()
    expect((rows ?? []).map((x) => x.question_id)).toEqual([q1])
  })

  test('GZ: an answer sent after the deadline grace is not graded at finish', async () => {
    // Deadline + 30 s grace = started_at + 31 s; started 24 s ago leaves ~7 s to save.
    const startedAt = new Date(Date.now() - 24_000).toISOString()
    const sessionId = await seedSession(victimUserId, 'mock_exam', { timeLimit: 1, startedAt })

    // Control: an in-window save lands.
    expect((await save(victim, sessionId, q1, q1Key, null)).error).toBeNull()

    await new Promise((resolve) => setTimeout(resolve, 9_000))

    const late = await save(victim, sessionId, q2, q1Key, null)
    expect(late.error?.message).toBe('session_expired')
    const lateCheck = await victim.rpc('claim_quiz_session', {
      p_session_id: sessionId,
      p_device_id: DEVICE_B,
    })
    expect(lateCheck.error?.message).toBe('session_expired')

    const r = await finish(victim, sessionId, null)
    expect(r.error).toBeNull()
    const d = r.data as Record<string, unknown>
    expect(d.expired).toBe(true)
    expect(d.answered_count).toBe(1)
    expect(resultIds(r.data)).toEqual([q1])
    expect(await countRows('quiz_session_answers', sessionId)).toBe(1)
  })
})
