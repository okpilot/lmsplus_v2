/**
 * Red Team Spec: finish_quiz_session — deactivated student (Vector HR)
 *
 * Surface: finish_quiz_session(p_session_id, p_device_id) (mig 20261004000300) and its sibling
 * complete_overdue_exam_session(p_session_id) (mig 20261004000400).
 *
 * HR (sibling-guard-gap): a student soft-deleted while holding a still-valid JWT finishes an open
 * session, or re-reads a finished one (results carry correct_option_id).
 *
 * Status: Expected to PASS. Each test carries a control arm: the same calls succeed once the
 * student is restored.
 */

import { expect, test } from '@playwright/test'
import { getAdminClient } from '../helpers/supabase'
import { clearOpenSessions } from './helpers/clear-open-sessions'
import { createAuthenticatedClient } from './helpers/redteam-client'
import { E2E_REDTEAM_QF_MARKER } from './helpers/seed-markers'
import { seedRedTeamUsers, VICTIM_EMAIL, VICTIM_PASSWORD } from './helpers/seed-users'

type Client = Awaited<ReturnType<typeof createAuthenticatedClient>>

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

const resultKeys = (data: unknown): unknown[] => {
  if (!isRecord(data) || !Array.isArray(data.results)) throw new Error('finish: bad shape')
  return data.results.map((r) => (isRecord(r) ? r.correct_option_id : undefined))
}

test.describe('Red Team: finish_quiz_session deactivated student (Vector HR)', () => {
  let admin: ReturnType<typeof getAdminClient>
  let victim: Client
  let orgId: string
  let victimUserId: string
  let q1: string
  let q2: string
  let q1Key: string
  let victimSoftDeleted = false

  const seedSession = async (opts: { timeLimit: number }) => {
    const { data, error } = await admin
      .from('quiz_sessions')
      .insert({
        organization_id: orgId,
        student_id: victimUserId,
        mode: 'mock_exam',
        total_questions: 2,
        time_limit_seconds: opts.timeLimit,
        config: { question_ids: [q1, q2], e2e_marker: E2E_REDTEAM_QF_MARKER },
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
      .select('ended_at, correct_count, score_percentage, passed')
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

  const setVictimDeleted = async (deleted: boolean) => {
    const { data, error } = await admin
      .from('users')
      .update({ deleted_at: deleted ? new Date().toISOString() : null })
      .eq('id', victimUserId)
      .select('id')
    if (error) throw new Error(`setVictimDeleted(${deleted}): ${error.message}`)
    if ((data?.length ?? 0) === 0) throw new Error(`setVictimDeleted(${deleted}): 0 rows`)
    victimSoftDeleted = deleted
  }

  const save = (sessionId: string, qid: string, opt: string) =>
    victim.rpc('save_quiz_answer', {
      p_session_id: sessionId,
      p_question_id: qid,
      p_answer: { selected_option_id: opt },
      p_time_spent_ms: 1000,
      p_device_id: null,
    })

  const finish = (sessionId: string) =>
    victim.rpc('finish_quiz_session', { p_session_id: sessionId, p_device_id: null })

  const seedFinishedOverdue = async () => {
    const overdueId = await seedSession({ timeLimit: 60 })
    expect((await save(overdueId, q1, q1Key)).error).toBeNull()
    const { error: backErr } = await admin
      .from('quiz_sessions')
      .update({ started_at: new Date(Date.now() - 600_000).toISOString() })
      .eq('id', overdueId)
    expect(backErr).toBeNull()
    const first = await finish(overdueId)
    expect(first.error).toBeNull()
    expect(isRecord(first.data) && first.data.expired).toBe(true)
    expect(resultKeys(first.data)).toEqual([q1Key])
    return { overdueId, first }
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
    const [row1, row2] = data
    if (typeof row1?.id !== 'string' || !row1.id)
      throw new Error('beforeAll questions: q1 id missing')
    if (typeof row2?.id !== 'string' || !row2.id)
      throw new Error('beforeAll questions: q2 id missing')
    if (typeof row1.correct_option_id !== 'string' || !row1.correct_option_id)
      throw new Error('beforeAll questions: q1 correct_option_id missing')
    q1 = row1.id
    q2 = row2.id
    q1Key = row1.correct_option_id
  })

  test.beforeEach(async () => {
    await clearOpenSessions(admin, victimUserId, 'finish-deactivated')
  })

  test.afterEach(async () => {
    const errors: string[] = []
    try {
      if (victimSoftDeleted) await setVictimDeleted(false)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    } finally {
      victimSoftDeleted = false
    }
    try {
      const { data, error } = await admin
        .from('quiz_sessions')
        .update({ deleted_at: new Date().toISOString() })
        .eq('config->>e2e_marker', E2E_REDTEAM_QF_MARKER)
        .is('deleted_at', null)
        .select('id')
      if (error) throw new Error(`soft-delete sessions: ${error.message}`)
      if ((data?.length ?? 0) > 0) console.info(`[finish-deactivated] soft-deleted ${data?.length}`)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    if (errors.length > 0) throw new Error(`afterEach: ${errors.join('; ')}`)
  })

  test('HR: a deactivated student cannot finish an open session', async () => {
    const sessionId = await seedSession({ timeLimit: 3600 })
    expect((await save(sessionId, q1, q1Key)).error).toBeNull()

    await setVictimDeleted(true)
    const r = await finish(sessionId)
    expect(r.data).toBeNull()
    expect(r.error?.message).toBe('user_not_found_or_inactive')
    expect((await readSession(sessionId)).ended_at).toBeNull()
    expect(await countAnswers(sessionId)).toBe(0)

    // Control: restored, the same call grades the saved answer.
    await setVictimDeleted(false)
    const ok = await finish(sessionId)
    expect(ok.error).toBeNull()
    expect(resultKeys(ok.data)).toEqual([q1Key])
    expect((await readSession(sessionId)).ended_at).not.toBeNull()
    expect(await countAnswers(sessionId)).toBe(1)
  })

  test('HR: a deactivated student cannot re-read a finished session or its keys', async () => {
    const { overdueId, first } = await seedFinishedOverdue()
    const before = await readSession(overdueId)
    expect(before.ended_at).not.toBeNull()

    await setVictimDeleted(true)
    const replay = await finish(overdueId)
    expect(replay.data).toBeNull()
    expect(replay.error?.message).toBe('user_not_found_or_inactive')
    const overdue = await victim.rpc('complete_overdue_exam_session', { p_session_id: overdueId })
    expect(overdue.data).toBeNull()
    expect(overdue.error?.message).toBe('user not found or inactive')
    expect(await readSession(overdueId)).toEqual(before)

    // Control: restored, both re-reads return the stored result.
    await setVictimDeleted(false)
    const again = await finish(overdueId)
    expect(again.error).toBeNull()
    expect(again.data).toEqual(first.data)
    const overdueOk = await victim.rpc('complete_overdue_exam_session', { p_session_id: overdueId })
    expect(overdueOk.error).toBeNull()
    const stored = await readSession(overdueId)
    const replayed = overdueOk.data
    if (!isRecord(replayed)) throw new Error('complete_overdue_exam_session: bad shape')
    expect(replayed.session_id).toBe(overdueId)
    expect(Number(replayed.score_percentage)).toBe(Number(stored.score_percentage))
    expect(replayed.passed).toBe(stored.passed ?? false)
    expect(replayed.total_questions).toBe(2)
    expect(Number(replayed.answered_count)).toBe(1)
  })
})
