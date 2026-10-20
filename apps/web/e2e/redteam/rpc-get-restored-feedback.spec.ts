/**
 * Red Team Spec: get_restored_feedback + _answer_feedback (#1549) — Vectors JK/JL/JM
 *
 * JK (answer-oracle): the keys come back only for answered, in-session questions of a PRACTICE
 *     session — never on mock_exam, never for an unanswered member, never for a progress row whose
 *     question is outside config.question_ids.
 * JL (idor): another student's session, an ended session and a soft-deleted session all refuse
 *     with the same token.
 * JM (privilege-escalation): `_answer_feedback` is not executable by `authenticated`.
 *
 * Status: Expected to PASS. Each test carries a control arm proving the guarded effect occurs.
 */

import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
import { clearOpenSessions } from './helpers/clear-open-sessions'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { E2E_REDTEAM_RF_MARKER } from './helpers/seed-markers'
import {
  ATTACKER_EMAIL,
  ATTACKER_PASSWORD,
  seedRedTeamUsers,
  VICTIM_EMAIL,
  VICTIM_PASSWORD,
} from './helpers/seed-users'

type Client = Awaited<ReturnType<typeof createAuthenticatedClient>>
type Feedback = { question_id: string; correct_option_id?: string; is_correct?: boolean }

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

function feedbackRows(data: unknown): Feedback[] {
  if (!isRecord(data) || !Array.isArray(data.feedback)) throw new Error('bad payload shape')
  return data.feedback as Feedback[]
}

test.describe('Red Team: get_restored_feedback (Vectors JK/JL/JM)', () => {
  let admin: ReturnType<typeof getAdminClient>
  let attacker: Client
  let victim: Client
  let orgId: string
  let attackerUserId: string
  let victimUserId: string
  let qs: { id: string; key: string; wrong: string }[]

  const seedSession = async (mode: 'quick_quiz' | 'mock_exam') => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: orgId,
        student_id: victimUserId,
        mode,
        total_questions: 2,
        time_limit_seconds: mode === 'mock_exam' ? 3600 : null,
        config: { question_ids: [qs[0]?.id, qs[1]?.id], e2e_marker: E2E_REDTEAM_RF_MARKER },
      })
      .select('id')
      .single()
    if (error || !isRecord(data) || typeof data.id !== 'string')
      throw new Error(`seedSession(${mode}): ${error?.message ?? 'bad shape'}`)
    return data.id
  }

  const saveAnswer = async (sessionId: string, questionId: string, option: string) => {
    const { error } = await victim.rpc('save_quiz_answer', {
      p_session_id: sessionId,
      p_question_id: questionId,
      p_answer: { selected_option_id: option },
      p_time_spent_ms: 100,
      p_device_id: null,
    })
    if (error) throw new Error(`save_quiz_answer: ${error.message}`)
  }

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
      .select('id, correct_option_id, options')
      .eq('organization_id', orgId)
      .eq('question_type', 'multiple_choice')
      .eq('status', 'active')
      .is('deleted_at', null)
      .not('correct_option_id', 'is', null)
      .order('id')
      .limit(3)
    if (error) throw new Error(`beforeAll questions: ${error.message}`)
    if (!Array.isArray(data) || data.length < 3) throw new Error('need 3 active MC questions')
    qs = data.map((r) => {
      const key = r.correct_option_id as string
      const opts: unknown = r.options
      if (!Array.isArray(opts)) throw new Error('options not an array')
      const wrong = opts.map((o) => (isRecord(o) ? o.id : null)).find((id) => id && id !== key)
      if (typeof wrong !== 'string') throw new Error('no wrong option')
      return { id: r.id as string, key, wrong }
    })
  })

  test.beforeEach(async () => {
    await clearOpenSessions(admin, victimUserId, 'restored-feedback')
    await clearOpenSessions(admin, attackerUserId, 'restored-feedback')
  })

  test.afterEach(async () => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('config->>e2e_marker', E2E_REDTEAM_RF_MARKER)
      .is('deleted_at', null)
      .select('id')
    if (error) throw new Error(`afterEach: ${error.message}`)
    if ((data?.length ?? 0) > 0) console.info(`[restored-feedback] soft-deleted ${data?.length}`)
  })

  test('JK: keys only for answered in-session questions of a practice session', async () => {
    const [q1, q2, q3] = qs
    if (!q1 || !q2 || !q3) throw new Error('fixture questions missing')
    const sessionId = await seedSession('quick_quiz')
    await saveAnswer(sessionId, q1.id, q1.wrong)
    // A progress row outside config.question_ids — unreachable via save_quiz_answer.
    const { error: insErr } = await admin.from('quiz_session_progress').insert({
      session_id: sessionId,
      question_id: q3.id,
      student_id: victimUserId,
      answer: { selected_option_id: q3.wrong },
    })
    expect(insErr).toBeNull()

    // Control: the answered member's key is revealed.
    const ok = await victim.rpc('get_restored_feedback', { p_session_id: sessionId })
    expect(ok.error).toBeNull()
    const rows = feedbackRows(ok.data)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.question_id).toBe(q1.id)
    expect(rows[0]?.correct_option_id).toBe(q1.key)
    expect(rows[0]?.is_correct).toBe(false)
    const ids = rows.map((r) => r.question_id)
    expect(ids).not.toContain(q2.id)
    expect(ids).not.toContain(q3.id)

    // Exam mode: same saved answer, no oracle.
    await clearOpenSessions(admin, victimUserId, 'restored-feedback')
    const examId = await seedSession('mock_exam')
    await saveAnswer(examId, q1.id, q1.wrong)
    const exam = await victim.rpc('get_restored_feedback', { p_session_id: examId })
    expect(exam.data).toBeNull()
    expect(exam.error?.message).toBe('unsupported_session_mode')
  })

  test('JL: foreign, ended and soft-deleted sessions refuse with session_not_found', async () => {
    const q1 = qs[0]
    if (!q1) throw new Error('fixture questions missing')
    const sessionId = await seedSession('quick_quiz')
    await saveAnswer(sessionId, q1.id, q1.key)

    const own = await victim.rpc('get_restored_feedback', { p_session_id: sessionId })
    expect(own.error).toBeNull()
    expect(feedbackRows(own.data)).toHaveLength(1)

    const foreign = await attacker.rpc('get_restored_feedback', { p_session_id: sessionId })
    expect(foreign.data).toBeNull()
    expect(foreign.error?.message).toBe('session_not_found')

    const missing = await attacker.rpc('get_restored_feedback', {
      p_session_id: '00000000-0000-4000-8000-0000000000ff',
    })
    expect(missing.error?.message).toBe(foreign.error?.message)

    const { error: endErr } = await admin
      .from('quiz_sessions')
      .update({ ended_at: new Date().toISOString() })
      .eq('id', sessionId)
    expect(endErr).toBeNull()
    const ended = await victim.rpc('get_restored_feedback', { p_session_id: sessionId })
    expect(ended.data).toBeNull()
    expect(ended.error?.message).toBe('session_not_found')

    const liveId = await seedSession('quick_quiz')
    await saveAnswer(liveId, q1.id, q1.key)
    const { error: delErr } = await admin
      .from('quiz_sessions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', liveId)
    expect(delErr).toBeNull()
    const deleted = await victim.rpc('get_restored_feedback', { p_session_id: liveId })
    expect(deleted.data).toBeNull()
    expect(deleted.error?.message).toBe('session_not_found')
  })

  test('JM: authenticated cannot execute _answer_feedback; service_role can', async () => {
    const q1 = qs[0]
    if (!q1) throw new Error('fixture questions missing')
    const { data: row, error: rowErr } = await admin
      .from('questions')
      .select('*')
      .eq('id', q1.id)
      .single()
    expect(rowErr).toBeNull()
    const args = { p_q: row, p_answer: { selected_option_id: 'z' } }

    const ctl = await admin.rpc('_answer_feedback', args)
    expect(ctl.error).toBeNull()
    expect(isRecord(ctl.data) && ctl.data.correct_option_id).toBe(q1.key)

    const r = await victim.rpc('_answer_feedback', args)
    expect(r.data).toBeNull()
    expect(r.error?.code).toBe('42501')
    expect(r.error?.message ?? '').toMatch(/permission denied for function _answer_feedback/i)
  })
})
