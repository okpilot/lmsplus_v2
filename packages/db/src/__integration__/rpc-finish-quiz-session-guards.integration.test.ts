import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { clearActiveSessions } from './cleanup'
import {
  claimSession,
  DEVICE,
  finishSeedSession,
  finishSession,
  OTHER_DEVICE,
  RIGHT,
  saveAnswer,
} from './finish-fixture'
import { answerRows, sessionRow } from './finish-readers'
import {
  insertSession,
  type ProgressFixture,
  progressRows,
  setupProgressFixture,
  startPractice,
} from './quiz-progress-fixture'
import { getAnonClient } from './setup'

describe('RPC: finish_quiz_session — guards', () => {
  let f: ProgressFixture

  beforeAll(async () => {
    f = await setupProgressFixture('finishg')
  })
  afterAll(async () => {
    await f.teardown()
  })
  beforeEach(async () => {
    await clearActiveSessions({ admin: f.admin, orgId: f.orgId })
  })

  const mc = (i: number) => f.mcIds[i] ?? ''

  /** Open mock exam with one saved answer: the protected state every refusal must leave intact. */
  async function openSessionWithAnswer() {
    const sessionId = await insertSession({ f, mode: 'mock_exam', questionIds: [mc(0), mc(1)] })
    await saveAnswer(f, sessionId, mc(0), RIGHT.mc)
    expect(await progressRows(f, sessionId)).toHaveLength(1)
    return sessionId
  }

  async function expectUntouched(sessionId: string) {
    expect((await sessionRow(f, sessionId)).ended_at).toBeNull()
    expect(await answerRows(f, sessionId)).toHaveLength(0)
  }

  it('refuses an unauthenticated caller', async () => {
    const sessionId = await openSessionWithAnswer()
    const { error } = await finishSession(getAnonClient(), sessionId)
    expect(error?.code).toBe('42501')
    await expectUntouched(sessionId)
  })

  it('refuses another student and leaves the session open', async () => {
    const sessionId = await openSessionWithAnswer()
    const { error } = await finishSession(f.other, sessionId, DEVICE)
    expect(error?.message).toContain('session_not_found')
    await expectUntouched(sessionId)
  })

  it('refuses another student finishing a finished session and reveals no results', async () => {
    const sessionId = await openSessionWithAnswer()
    await finishSeedSession(f.student, sessionId)
    const stored = await sessionRow(f, sessionId)
    expect(stored.ended_at).not.toBeNull()
    expect(await answerRows(f, sessionId)).toHaveLength(1)

    const { data, error } = await finishSession(f.other, sessionId, DEVICE)

    expect(error?.message).toContain('session_not_found')
    expect(data).toBeNull()
    expect(await answerRows(f, sessionId)).toHaveLength(1)
    expect(Number((await sessionRow(f, sessionId)).score_percentage)).toBe(
      Number(stored.score_percentage),
    )
  })

  it('refuses a session that does not exist', async () => {
    const { error } = await finishSession(f.student, '33333333-3333-4333-8333-333333333333')
    expect(error?.message).toContain('session_not_found')
  })

  it('refuses a discarded session', async () => {
    const sessionId = await openSessionWithAnswer()
    const { error: updErr } = await f.admin
      .from('quiz_sessions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', sessionId)
    expect(updErr).toBeNull()

    const { error } = await finishSession(f.student, sessionId)

    expect(error?.message).toContain('session_discarded')
    expect((await sessionRow(f, sessionId)).ended_at).toBeNull()
    expect(await answerRows(f, sessionId)).toHaveLength(0)
  })

  it('refuses a session saved for later, reporting it as saved rather than discarded', async () => {
    const sessionId = await startPractice(f, 'quick_quiz', [mc(0), mc(1)])
    await saveAnswer(f, sessionId, mc(0), RIGHT.mc)
    expect(await progressRows(f, sessionId)).toHaveLength(1)
    const now = new Date().toISOString()
    const { error: updErr } = await f.admin
      .from('quiz_sessions')
      .update({ saved_at: now, deleted_at: now })
      .eq('id', sessionId)
    expect(updErr).toBeNull()

    const { error } = await finishSession(f.student, sessionId)

    expect(error?.message).toContain('session_saved')
    expect((await sessionRow(f, sessionId)).ended_at).toBeNull()
    expect(await answerRows(f, sessionId)).toHaveLength(0)
  })

  it('refuses a device that another device has taken the session over from', async () => {
    const sessionId = await openSessionWithAnswer()
    await claimSession(f, sessionId, DEVICE)

    const { error } = await finishSession(f.student, sessionId, OTHER_DEVICE)

    expect(error?.message).toContain('session_taken_over')
    await expectUntouched(sessionId)
    const ok = await finishSession(f.student, sessionId, DEVICE)
    expect(ok.error).toBeNull()
  })

  it('refuses a discovery session', async () => {
    const sessionId = await insertSession({ f, mode: 'discovery', questionIds: [mc(0), mc(1)] })
    const { error } = await finishSession(f.student, sessionId)
    expect(error?.message).toContain('unsupported_session_mode')
    expect((await sessionRow(f, sessionId)).ended_at).toBeNull()
  })

  it('refuses further answer saves once the session is finished', async () => {
    const sessionId = await startPractice(f, 'quick_quiz', [mc(0), mc(1)])
    await saveAnswer(f, sessionId, mc(0), RIGHT.mc)
    await finishSeedSession(f.student, sessionId)
    expect((await sessionRow(f, sessionId)).ended_at).not.toBeNull()

    const { error } = await f.student.rpc('save_quiz_answer', {
      p_session_id: sessionId,
      p_question_id: mc(1),
      p_answer: RIGHT.mc,
      p_time_spent_ms: 1000,
      p_device_id: DEVICE,
    })

    expect(error?.message).toContain('session_ended')
    expect(await progressRows(f, sessionId)).toHaveLength(1)
  })

  it('refuses a session whose config has no question list instead of grading nothing', async () => {
    const sessionId = await openSessionWithAnswer()
    const { error: cfgErr } = await f.admin
      .from('quiz_sessions')
      .update({ config: { pass_mark: 75 } })
      .eq('id', sessionId)
    expect(cfgErr).toBeNull()

    const { error } = await finishSession(f.student, sessionId, DEVICE)

    expect(error?.message).toContain('session_config_malformed')
    await expectUntouched(sessionId)
  })
})
