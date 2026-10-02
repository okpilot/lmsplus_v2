import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { clearActiveSessions } from './cleanup'
import { requireRpcResult } from './guards'
import {
  insertSession,
  ORDER_ITEMS,
  type ProgressFixture,
  progressRows,
  setupProgressFixture,
  startPractice,
} from './quiz-progress-fixture'

const DEVICE_A = '11111111-1111-4111-8111-111111111111'
const DEVICE_B = '22222222-2222-4222-8222-222222222222'

describe('RPC: answer checks also save progress', () => {
  let f: ProgressFixture

  beforeAll(async () => {
    f = await setupProgressFixture('qcheck')
  })
  afterAll(async () => {
    await f.teardown()
  })
  beforeEach(async () => {
    await clearActiveSessions({ admin: f.admin, orgId: f.orgId })
  })

  it('saves the selected option and time when a multiple-choice answer is checked', async () => {
    const sessionId = await startPractice(f, 'quick_quiz', f.mcIds.slice(0, 3))
    const { data, error } = await f.student.rpc('check_quiz_answer', {
      p_question_id: f.mcIds[0],
      p_selected_option_id: 'a',
      p_session_id: sessionId,
      p_device_id: DEVICE_A,
      p_time_spent_ms: 6500,
    })
    expect(error).toBeNull()
    expect(requireRpcResult<{ is_correct: boolean }>(data, 'check').is_correct).toBe(false)

    const rows = await progressRows(f, sessionId)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      question_id: f.mcIds[0],
      student_id: f.studentId,
      answer: { selected_option_id: 'a' },
      time_spent_ms: 6500,
    })
    expect(JSON.stringify(rows[0])).not.toContain('correct')
  })

  it('still grades and saves a call made without a device or time', async () => {
    const sessionId = await startPractice(f, 'smart_review', f.mcIds.slice(0, 3))
    const { data, error } = await f.student.rpc('check_quiz_answer', {
      p_question_id: f.mcIds[1],
      p_selected_option_id: 'b',
      p_session_id: sessionId,
    })
    expect(error).toBeNull()
    expect(requireRpcResult<{ is_correct: boolean }>(data, 'check').is_correct).toBe(true)
    const rows = await progressRows(f, sessionId)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ answer: { selected_option_id: 'b' }, time_spent_ms: 0 })
  })

  it('keeps the latest answer and largest time across repeated checks', async () => {
    const sessionId = await startPractice(f, 'quick_quiz', f.mcIds.slice(0, 3))
    const check = (option: string, ms: number) =>
      f.student.rpc('check_quiz_answer', {
        p_question_id: f.mcIds[0],
        p_selected_option_id: option,
        p_session_id: sessionId,
        p_time_spent_ms: ms,
      })
    expect((await check('a', 7000)).error).toBeNull()
    expect((await check('c', 3000)).error).toBeNull()
    const rows = await progressRows(f, sessionId)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ answer: { selected_option_id: 'c' }, time_spent_ms: 7000 })
  })

  it('saves the answer of each non-multiple-choice type when it is checked', async () => {
    const ids = [f.shortId, f.dialogId, f.orderingId, f.diagramId]
    const sessionId = await startPractice(f, 'quick_quiz', ids)
    const cases: Array<[string, Record<string, unknown>, unknown]> = [
      [f.shortId, { p_response_text: 'wilco' }, { response_text: 'wilco' }],
      [
        f.dialogId,
        { p_blank_answers: [{ blank_index: 0, response_text: 'cleared' }] },
        { blanks: [{ blank_index: 0, response_text: 'cleared' }] },
      ],
      [
        f.orderingId,
        { p_order: [...ORDER_ITEMS].reverse().map((i) => i.id) },
        { order: [...ORDER_ITEMS].reverse().map((i) => i.id) },
      ],
      [
        f.diagramId,
        { p_mapping: [{ zone_id: 'zone-1', label_id: 'lbl-1' }] },
        { mapping: [{ zone_id: 'zone-1', label_id: 'lbl-1' }] },
      ],
    ]
    for (const [questionId, params, stored] of cases) {
      const { error } = await f.student.rpc('check_non_mc_answer', {
        p_question_id: questionId,
        p_session_id: sessionId,
        p_device_id: DEVICE_A,
        p_time_spent_ms: 1200,
        ...params,
      })
      expect(error, `check ${questionId}`).toBeNull()
      const rows = await progressRows(f, sessionId)
      expect(rows.find((r) => r.question_id === questionId)).toMatchObject({
        answer: stored,
        time_spent_ms: 1200,
      })
    }
    expect(await progressRows(f, sessionId)).toHaveLength(4)
  })

  it('saves nothing when a non-multiple-choice check is rejected', async () => {
    const sessionId = await startPractice(f, 'quick_quiz', [f.shortId])
    const { error } = await f.student.rpc('check_non_mc_answer', {
      p_question_id: f.shortId,
      p_session_id: sessionId,
      p_response_text: 'wilco',
      p_order: ['x'],
    })
    expect(error?.message).toContain('answer_type_mismatch')
    expect(await progressRows(f, sessionId)).toHaveLength(0)
  })

  it('works for a student calling the old argument list of both check RPCs', async () => {
    const sessionId = await startPractice(f, 'quick_quiz', [f.mcIds[0]!, f.shortId])
    const mc = await f.student.rpc('check_quiz_answer', {
      p_question_id: f.mcIds[0],
      p_selected_option_id: 'b',
      p_session_id: sessionId,
    })
    expect(mc.error).toBeNull()
    const nonMc = await f.student.rpc('check_non_mc_answer', {
      p_question_id: f.shortId,
      p_session_id: sessionId,
      p_response_text: 'wilco',
    })
    expect(nonMc.error).toBeNull()
    expect(requireRpcResult<{ is_correct: boolean }>(nonMc.data, 'check').is_correct).toBe(true)
    expect(await progressRows(f, sessionId)).toHaveLength(2)
  })

  it.each(['mock_exam', 'internal_exam', 'vfr_rt_exam'] as const)(
    'still refuses the answer check in %s mode and saves nothing',
    async (mode) => {
      const sessionId = await insertSession({ f, mode, questionIds: [f.mcIds[0]!, f.shortId] })
      const mc = await f.student.rpc('check_quiz_answer', {
        p_question_id: f.mcIds[0],
        p_selected_option_id: 'b',
        p_session_id: sessionId,
      })
      expect(mc.data).toBeNull()
      expect(mc.error?.message).toContain('unsupported_session_mode')
      const nonMc = await f.student.rpc('check_non_mc_answer', {
        p_question_id: f.shortId,
        p_session_id: sessionId,
        p_response_text: 'wilco',
      })
      expect(nonMc.data).toBeNull()
      expect(nonMc.error?.message).toContain('unsupported_session_mode')
      expect(await progressRows(f, sessionId)).toHaveLength(0)
    },
  )

  it('refuses a check from a device that no longer holds the session and returns no key', async () => {
    const sessionId = await startPractice(f, 'quick_quiz', [f.mcIds[0]!, f.shortId])
    const claim = await f.student.rpc('claim_quiz_session', {
      p_session_id: sessionId,
      p_device_id: DEVICE_B,
    })
    expect(claim.error).toBeNull()
    const saved = await f.student.rpc('check_quiz_answer', {
      p_question_id: f.mcIds[0],
      p_selected_option_id: 'a',
      p_session_id: sessionId,
      p_device_id: DEVICE_B,
    })
    expect(saved.error).toBeNull()
    expect(await progressRows(f, sessionId)).toHaveLength(1)

    for (const device of [DEVICE_A, null]) {
      const mc = await f.student.rpc('check_quiz_answer', {
        p_question_id: f.mcIds[0],
        p_selected_option_id: 'd',
        p_session_id: sessionId,
        p_device_id: device,
      })
      expect(mc.data).toBeNull()
      expect(mc.error?.message).toContain('session_taken_over')
      const nonMc = await f.student.rpc('check_non_mc_answer', {
        p_question_id: f.shortId,
        p_session_id: sessionId,
        p_response_text: 'wilco',
        p_device_id: device,
      })
      expect(nonMc.data).toBeNull()
      expect(nonMc.error?.message).toContain('session_taken_over')
    }
    const rows = await progressRows(f, sessionId)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.answer).toEqual({ selected_option_id: 'a' })
  })

  it('refuses a time outside 0 to 24 hours on a check and saves nothing', async () => {
    const sessionId = await startPractice(f, 'quick_quiz', [f.mcIds[0]!])
    const { data, error } = await f.student.rpc('check_quiz_answer', {
      p_question_id: f.mcIds[0],
      p_selected_option_id: 'b',
      p_session_id: sessionId,
      p_time_spent_ms: 86_400_001,
    })
    expect(data).toBeNull()
    expect(error?.message).toContain('invalid_time_spent')
    expect(await progressRows(f, sessionId)).toHaveLength(0)
  })

  it("refuses another student's session on both check RPCs and saves nothing", async () => {
    const sessionId = await startPractice(f, 'quick_quiz', [f.mcIds[0]!, f.shortId])
    const mc = await f.other.rpc('check_quiz_answer', {
      p_question_id: f.mcIds[0],
      p_selected_option_id: 'b',
      p_session_id: sessionId,
    })
    expect(mc.error?.message).toContain('session not found or not owned')
    const nonMc = await f.other.rpc('check_non_mc_answer', {
      p_question_id: f.shortId,
      p_session_id: sessionId,
      p_response_text: 'wilco',
    })
    expect(nonMc.error?.message).toContain('session not found or not owned')
    // Non-vacuous: the owner can save into the very same session.
    const own = await f.student.rpc('check_quiz_answer', {
      p_question_id: f.mcIds[0],
      p_selected_option_id: 'b',
      p_session_id: sessionId,
    })
    expect(own.error).toBeNull()
    const rows = await progressRows(f, sessionId)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.student_id).toBe(f.studentId)
  })
})
