import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { clearActiveSessions } from './cleanup'
import { requireRpcResult } from './guards'
import {
  insertSession,
  type ProgressFixture,
  setupProgressFixture,
  startPractice,
} from './quiz-progress-fixture'
import { ORDER_ITEMS } from './quiz-progress-questions'
import { getAnonClient } from './setup'

type FeedbackElement = Record<string, unknown> & { question_id: string; question_type: string }

describe('RPC: get_restored_feedback', () => {
  let f: ProgressFixture

  beforeAll(async () => {
    f = await setupProgressFixture('restfb')
  })
  afterAll(async () => {
    await f.teardown()
  })
  beforeEach(async () => {
    await clearActiveSessions({ admin: f.admin, orgId: f.orgId })
  })

  const orderIds = () => ORDER_ITEMS.map((i) => i.id)

  /** Answer one question as the student through the real check RPC; returns the check output. */
  async function check(sessionId: string, questionId: string, params: Record<string, unknown>) {
    const rpc = questionId === f.mcIds[0] ? 'check_quiz_answer' : 'check_non_mc_answer'
    const { data, error } = await f.student.rpc(rpc, {
      p_question_id: questionId,
      p_session_id: sessionId,
      ...params,
    })
    expect(error, `${rpc} ${questionId}`).toBeNull()
    return requireRpcResult<Record<string, unknown>>(data, rpc)
  }

  async function restore(sessionId: string, client = f.student) {
    const { data, error } = await client.rpc('get_restored_feedback', { p_session_id: sessionId })
    return { data, error }
  }

  async function restored(sessionId: string): Promise<FeedbackElement[]> {
    const { data, error } = await restore(sessionId)
    expect(error).toBeNull()
    return requireRpcResult<{ feedback: FeedbackElement[] }>(data, 'restore').feedback
  }

  function stripIdentity({ question_id: _id, question_type: _type, ...rest }: FeedbackElement) {
    return rest
  }

  async function sessionWithAnswers() {
    const ids = [f.mcIds[0]!, f.shortId, f.dialogId, f.orderingId, f.diagramId]
    const sessionId = await startPractice(f, 'quick_quiz', ids)
    const expected = new Map<string, Record<string, unknown>>()
    expected.set(f.mcIds[0]!, await check(sessionId, f.mcIds[0]!, { p_selected_option_id: 'a' }))
    expected.set(f.shortId, await check(sessionId, f.shortId, { p_response_text: 'wilco' }))
    expected.set(
      f.dialogId,
      await check(sessionId, f.dialogId, {
        p_blank_answers: [{ blank_index: 0, response_text: 'nope' }],
      }),
    )
    expected.set(
      f.orderingId,
      await check(sessionId, f.orderingId, { p_order: [...orderIds()].reverse() }),
    )
    expected.set(
      f.diagramId,
      await check(sessionId, f.diagramId, {
        p_mapping: [{ zone_id: 'zone-1', label_id: 'lbl-1' }],
      }),
    )
    return { sessionId, expected }
  }

  it('returns for every saved answer the same feedback its check call returned', async () => {
    const { sessionId, expected } = await sessionWithAnswers()
    const feedback = await restored(sessionId)
    expect(feedback).toHaveLength(5)
    const types = new Map(feedback.map((e) => [e.question_id, e.question_type]))
    expect(types.get(f.mcIds[0]!)).toBe('multiple_choice')
    expect(types.get(f.shortId)).toBe('short_answer')
    expect(types.get(f.dialogId)).toBe('dialog_fill')
    expect(types.get(f.orderingId)).toBe('ordering')
    expect(types.get(f.diagramId)).toBe('diagram_label')
    for (const el of feedback) {
      expect(stripIdentity(el), el.question_type).toEqual(expected.get(el.question_id))
    }
  })

  it('omits an in-session question that has no saved answer', async () => {
    const sessionId = await startPractice(f, 'quick_quiz', [f.mcIds[0]!, f.shortId])
    await check(sessionId, f.shortId, { p_response_text: 'wilco' })
    const feedback = await restored(sessionId)
    expect(feedback.map((e) => e.question_id)).toEqual([f.shortId])
  })

  it('returns an empty list when nothing was answered', async () => {
    const sessionId = await startPractice(f, 'quick_quiz', [f.mcIds[0]!, f.shortId])
    expect(await restored(sessionId)).toEqual([])
  })

  it("refuses another student's session", async () => {
    const { sessionId } = await sessionWithAnswers()
    expect((await restored(sessionId)).length).toBeGreaterThan(0)
    const { error } = await restore(sessionId, f.other)
    expect(error?.message).toContain('session_not_found')
  })

  it('refuses an ended session', async () => {
    const { sessionId } = await sessionWithAnswers()
    expect((await restored(sessionId)).length).toBeGreaterThan(0)
    const { error: endErr } = await f.admin
      .from('quiz_sessions')
      .update({ ended_at: new Date().toISOString() })
      .eq('id', sessionId)
    expect(endErr).toBeNull()
    const { error } = await restore(sessionId)
    expect(error?.message).toContain('session_not_found')
  })

  it('refuses a soft-deleted session', async () => {
    const { sessionId } = await sessionWithAnswers()
    expect((await restored(sessionId)).length).toBeGreaterThan(0)
    const { error: delErr } = await f.admin
      .from('quiz_sessions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', sessionId)
    expect(delErr).toBeNull()
    const { error } = await restore(sessionId)
    expect(error?.message).toContain('session_not_found')
  })

  it('refuses an exam-mode session', async () => {
    const sessionId = await insertSession({
      f,
      mode: 'mock_exam',
      questionIds: f.mcIds.slice(0, 2),
    })
    const { error } = await restore(sessionId)
    expect(error?.message).toContain('unsupported_session_mode')
  })

  it('refuses an anonymous caller', async () => {
    const { sessionId } = await sessionWithAnswers()
    const { data, error } = await restore(sessionId, getAnonClient())
    expect(data).toBeNull()
    expect(error).not.toBeNull()
    expect(`${error?.code} ${error?.message}`).toMatch(/42501|permission denied/i)
  })

  it('refuses a deactivated student', async () => {
    const { sessionId } = await sessionWithAnswers()
    expect((await restored(sessionId)).length).toBeGreaterThan(0)
    const { error: offErr } = await f.admin
      .from('users')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', f.studentId)
    expect(offErr).toBeNull()
    try {
      const { error } = await restore(sessionId)
      expect(error?.message).toContain('user_not_found_or_inactive')
    } finally {
      const { error } = await f.admin
        .from('users')
        .update({ deleted_at: null })
        .eq('id', f.studentId)
      if (error) console.error('[reactivate student]', error.message)
    }
  })

  it('does not touch the saved progress rows', async () => {
    const { sessionId } = await sessionWithAnswers()
    const read = async () => {
      const { data, error } = await f.admin
        .from('quiz_session_progress')
        .select('question_id, answer, updated_at')
        .eq('session_id', sessionId)
        .order('question_id')
      expect(error).toBeNull()
      return data
    }
    const before = await read()
    expect(before).toHaveLength(5)
    await restored(sessionId)
    expect(await read()).toEqual(before)
  })

  it('skips a saved answer that no longer matches its question type and returns the rest', async () => {
    const sessionId = await startPractice(f, 'quick_quiz', [f.mcIds[0]!, f.shortId])
    const mcChecked = await check(sessionId, f.mcIds[0]!, { p_selected_option_id: 'a' })
    await check(sessionId, f.shortId, { p_response_text: 'wilco' })
    const { data: planted, error: plantErr } = await f.admin
      .from('quiz_session_progress')
      .update({ answer: { selected_option_id: 'a' } })
      .eq('session_id', sessionId)
      .eq('question_id', f.shortId)
      .select('question_id')
    expect(plantErr).toBeNull()
    expect(planted).toHaveLength(1)
    const feedback = await restored(sessionId)
    expect(feedback.map((e) => e.question_id)).toEqual([f.mcIds[0]])
    expect(stripIdentity(feedback[0]!)).toEqual(mcChecked)
  })

  it('still returns feedback for a question soft-deleted after it was answered', async () => {
    const sessionId = await startPractice(f, 'quick_quiz', [f.mcIds[0]!, f.shortId])
    const checked = await check(sessionId, f.shortId, { p_response_text: 'wilco' })
    const { error: delErr } = await f.admin
      .from('questions')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', f.shortId)
    expect(delErr).toBeNull()
    try {
      const feedback = await restored(sessionId)
      expect(feedback).toHaveLength(1)
      expect(stripIdentity(feedback[0]!)).toEqual(checked)
    } finally {
      const { error } = await f.admin
        .from('questions')
        .update({ deleted_at: null })
        .eq('id', f.shortId)
      if (error) console.error('[restore question]', error.message)
    }
  })
})
