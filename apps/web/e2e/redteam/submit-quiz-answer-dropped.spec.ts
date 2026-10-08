/**
 * Red Team Spec: submit_quiz_answer is gone (#1494) — Vector HX
 *
 * Surface: mig 20261008000300 drops submit_quiz_answer(uuid, uuid, text, integer), which returned
 * is_correct + correct_option_id per answer. check_quiz_answer is the only remaining per-answer
 * keyed-feedback RPC and refuses exam modes.
 *
 * HX (answer-oracle): during a live mock_exam the student probes a per-answer RPC for the key.
 *
 * Status: Expected to PASS. CONTROL: check_quiz_answer returns the key on a quick_quiz session
 * over the same question.
 */

import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
import { clearOpenSessions } from './helpers/clear-open-sessions'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { E2E_REDTEAM_SX_MARKER } from './helpers/seed-markers'
import { ATTACKER_EMAIL, ATTACKER_PASSWORD, seedRedTeamUsers } from './helpers/seed-users'

type Client = Awaited<ReturnType<typeof createAuthenticatedClient>>

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

test.describe('Red Team: submit_quiz_answer dropped (Vector HX)', () => {
  let admin: ReturnType<typeof getAdminClient>
  let attacker: Client
  let orgId: string
  let attackerUserId: string
  let q1: string
  let q2: string
  let key1: string
  let wrong1: string

  const seedSession = async (mode: 'mock_exam' | 'quick_quiz') => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: orgId,
        student_id: attackerUserId,
        mode,
        total_questions: 2,
        time_limit_seconds: mode === 'mock_exam' ? 3600 : null,
        config: { question_ids: [q1, q2], e2e_marker: E2E_REDTEAM_SX_MARKER },
      })
      .select('id')
      .single()
    if (error || !isRecord(data) || typeof data.id !== 'string')
      throw new Error(`seedSession: ${error?.message ?? 'bad shape'}`)
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

  const countResponses = async () => {
    const { count, error } = await admin
      .from('student_responses')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', attackerUserId)
      .eq('question_id', q1)
    if (error) throw new Error(`countResponses: ${error.message}`)
    return count ?? 0
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
      .select('id, correct_option_id, options')
      .eq('organization_id', orgId)
      .eq('question_type', 'multiple_choice')
      .eq('status', 'active')
      .is('deleted_at', null)
      .not('correct_option_id', 'is', null)
      .order('id')
      .limit(2)
    if (error) throw new Error(`beforeAll questions: ${error.message}`)
    if (!Array.isArray(data) || data.length < 2) throw new Error('need 2 active MC questions')
    const [a, b] = data
    if (
      typeof a?.id !== 'string' ||
      typeof b?.id !== 'string' ||
      typeof a.correct_option_id !== 'string'
    )
      throw new Error('beforeAll questions: bad row')
    q1 = a.id
    q2 = b.id
    key1 = a.correct_option_id
    const opts: unknown = a.options
    const other = Array.isArray(opts)
      ? opts.find((o: unknown) => isRecord(o) && typeof o.id === 'string' && o.id !== key1)
      : undefined
    if (!isRecord(other) || typeof other.id !== 'string')
      throw new Error('beforeAll: no wrong option')
    wrong1 = other.id
  })

  test.beforeEach(async () => {
    await clearOpenSessions(admin, attackerUserId, 'submit-quiz-answer-dropped')
  })

  test.afterEach(async () => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('config->>e2e_marker', E2E_REDTEAM_SX_MARKER)
      .is('deleted_at', null)
      .select('id')
    if (error) throw new Error(`afterEach soft-delete sessions: ${error.message}`)
    if ((data?.length ?? 0) > 0)
      console.info(`[submit-quiz-answer-dropped] soft-deleted ${data?.length}`)
  })

  test('HX: no per-answer RPC reveals the key during a live mock exam', async () => {
    const examId = await seedSession('mock_exam')
    const before = await readSession(examId)
    expect(before.ended_at).toBeNull()
    expect(before.deleted_at).toBeNull()
    const responsesBefore = await countResponses()

    for (const option of [key1, wrong1]) {
      const r = await attacker.rpc('submit_quiz_answer', {
        p_session_id: examId,
        p_question_id: q1,
        p_selected_option: option,
        p_response_time_ms: 1000,
      })
      expect(r.data).toBeNull()
      expect(r.error?.code).toBe('PGRST202')
    }

    const check = await attacker.rpc('check_quiz_answer', {
      p_question_id: q1,
      p_selected_option_id: key1,
      p_session_id: examId,
    })
    expect(check.data).toBeNull()
    expect(check.error?.message).toContain('unsupported_session_mode')

    expect(await readSession(examId)).toEqual(before)
    expect(await countAnswers(examId)).toBe(0)
    expect(await countResponses()).toBe(responsesBefore)

    // CONTROL: the remaining keyed-feedback RPC reveals the key on a practice session.
    const { error: endErr } = await admin
      .from('quiz_sessions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', examId)
    expect(endErr).toBeNull()
    const practiceId = await seedSession('quick_quiz')
    const practice = await attacker.rpc('check_quiz_answer', {
      p_question_id: q1,
      p_selected_option_id: wrong1,
      p_session_id: practiceId,
    })
    expect(practice.error).toBeNull()
    if (!isRecord(practice.data)) throw new Error('check_quiz_answer: bad shape')
    expect(practice.data.is_correct).toBe(false)
    expect(practice.data.correct_option_id).toBe(key1)
  })
})
