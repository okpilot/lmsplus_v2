import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { clearActiveSessions } from './cleanup'
import { requireRpcResult } from './guards'
import {
  insertSession,
  type ProgressFixture,
  progressRows,
  setupProgressFixture,
  startPractice,
} from './quiz-progress-fixture'
import { ORDER_ITEMS } from './quiz-progress-questions'

type Progress = {
  status: string
  mode: string
  current_index: number
  pinned_question_ids: string[]
  active_device_id: string | null
  answers: Array<{
    question_id: string
    answer: unknown
    time_spent_ms: number
    answered_at: string | null
  }>
}

const DEVICE = '11111111-1111-4111-8111-111111111111'

describe('RPC: quiz progress — save answer, position and read', () => {
  let f: ProgressFixture

  beforeAll(async () => {
    f = await setupProgressFixture('qprog')
  })
  afterAll(async () => {
    await f.teardown()
  })
  beforeEach(async () => {
    await clearActiveSessions({ admin: f.admin, orgId: f.orgId })
  })

  async function save(sessionId: string, questionId: string, answer: unknown, ms = 1000) {
    return f.student.rpc('save_quiz_answer', {
      p_session_id: sessionId,
      p_question_id: questionId,
      p_answer: answer,
      p_time_spent_ms: ms,
      p_device_id: DEVICE,
    })
  }

  async function load(sessionId: string): Promise<Progress> {
    const { data, error } = await f.student.rpc('get_quiz_progress', { p_session_id: sessionId })
    expect(error).toBeNull()
    return requireRpcResult<Progress>(data, 'get_quiz_progress')
  }

  it('stores a saved answer and returns it from get_quiz_progress', async () => {
    const sessionId = await startPractice(f, 'quick_quiz', f.mcIds.slice(0, 3))
    const { error } = await save(sessionId, f.mcIds[0]!, { selected_option_id: 'c' }, 4200)
    expect(error).toBeNull()

    const rows = await progressRows(f, sessionId)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      question_id: f.mcIds[0],
      student_id: f.studentId,
      answer: { selected_option_id: 'c' },
      time_spent_ms: 4200,
    })
    expect(rows[0]?.answered_at).not.toBeNull()

    const progress = await load(sessionId)
    expect(progress.status).toBe('open')
    expect(progress.mode).toBe('quick_quiz')
    expect(progress.answers).toHaveLength(1)
    expect(progress.answers[0]).toMatchObject({
      question_id: f.mcIds[0],
      answer: { selected_option_id: 'c' },
      time_spent_ms: 4200,
    })
  })

  it('keeps the latest answer and the largest time when a question is saved again', async () => {
    const sessionId = await startPractice(f, 'quick_quiz', f.mcIds.slice(0, 3))
    expect((await save(sessionId, f.mcIds[0]!, { selected_option_id: 'a' }, 5000)).error).toBeNull()
    expect((await save(sessionId, f.mcIds[0]!, { selected_option_id: 'd' }, 2000)).error).toBeNull()
    let rows = await progressRows(f, sessionId)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ answer: { selected_option_id: 'd' }, time_spent_ms: 5000 })

    expect((await save(sessionId, f.mcIds[0]!, { selected_option_id: 'd' }, 9000)).error).toBeNull()
    rows = await progressRows(f, sessionId)
    expect(rows[0]?.time_spent_ms).toBe(9000)
  })

  it('exposes no answer key or correctness in the progress payload', async () => {
    const sessionId = await startPractice(f, 'quick_quiz', f.mcIds.slice(0, 3))
    // 'b' is the correct option of every seeded question.
    expect((await save(sessionId, f.mcIds[0]!, { selected_option_id: 'b' })).error).toBeNull()

    const progress = await load(sessionId)
    expect(progress.answers).toHaveLength(1)
    const serialised = JSON.stringify(progress)
    for (const forbidden of ['correct', 'is_correct', 'explanation', 'canonical']) {
      expect(serialised).not.toContain(forbidden)
    }
    expect(Object.keys(progress.answers[0] ?? {}).sort()).toEqual([
      'answer',
      'answered_at',
      'question_id',
      'time_spent_ms',
    ])
    const { data: columns, error } = await f.admin
      .from('quiz_session_progress')
      .select('*')
      .limit(1)
      .single()
    expect(error).toBeNull()
    expect(Object.keys(columns as Record<string, unknown>).sort()).toEqual([
      'answer',
      'answered_at',
      'question_id',
      'session_id',
      'student_id',
      'time_spent_ms',
      'updated_at',
    ])
  })

  it('accepts a well-formed answer for each question type', async () => {
    const ids = [f.mcIds[0]!, f.shortId, f.dialogId, f.orderingId, f.diagramId]
    const sessionId = await startPractice(f, 'quick_quiz', ids)
    const answers: Array<[string, unknown]> = [
      [f.mcIds[0]!, { selected_option_id: 'a' }],
      [f.shortId, { response_text: 'wilco' }],
      [f.dialogId, { blanks: [{ blank_index: 0, response_text: 'cleared' }] }],
      [f.orderingId, { order: ORDER_ITEMS.map((i) => i.id) }],
      [f.diagramId, { mapping: [{ zone_id: 'zone-1', label_id: 'lbl-1' }] }],
    ]
    for (const [questionId, answer] of answers) {
      const { error } = await save(sessionId, questionId, answer)
      expect(error, `answer for ${questionId}`).toBeNull()
    }
    expect(await progressRows(f, sessionId)).toHaveLength(5)
    expect((await load(sessionId)).answers).toHaveLength(5)
  })

  it('refuses an answer whose shape does not match the question type', async () => {
    const ids = [f.mcIds[0]!, f.shortId, f.dialogId, f.orderingId, f.diagramId]
    const sessionId = await startPractice(f, 'quick_quiz', ids)
    const bad: Array<[string, unknown]> = [
      [f.mcIds[0]!, { response_text: 'a' }],
      [f.mcIds[0]!, { selected_option_id: 'a', extra: 1 }],
      [f.mcIds[0]!, { selected_option_id: 7 }],
      [f.shortId, { selected_option_id: 'a' }],
      [f.dialogId, { blanks: [{ blank_index: 'x', response_text: 'cleared' }] }],
      [f.dialogId, { blanks: [{ blank_index: 0 }] }],
      [f.dialogId, { blanks: 'cleared' }],
      [f.orderingId, { order: [1, 2] }],
      [f.orderingId, { order: 'a' }],
      [f.diagramId, { mapping: [{ zone_id: 'zone-1' }] }],
      [f.diagramId, { mapping: ['zone-1'] }],
      [f.mcIds[0]!, 'a'],
    ]
    for (const [questionId, answer] of bad) {
      const { error } = await save(sessionId, questionId, answer)
      expect(error?.message, JSON.stringify(answer)).toContain('invalid_answer')
    }
    expect(await progressRows(f, sessionId)).toHaveLength(0)
  })

  it.each([
    ['multiple_choice'],
    ['short_answer'],
    ['dialog_fill'],
    ['ordering'],
    ['diagram_label'],
  ])('refuses an empty answer object for a %s question and stores nothing', async (type) => {
    const idByType: Record<string, string> = {
      multiple_choice: f.mcIds[0] ?? '',
      short_answer: f.shortId,
      dialog_fill: f.dialogId,
      ordering: f.orderingId,
      diagram_label: f.diagramId,
    }
    const questionId = idByType[type] ?? ''
    const sessionId = await startPractice(f, 'quick_quiz', [questionId])
    const { error } = await save(sessionId, questionId, {})
    expect(error?.message).toContain('invalid_answer')
    const { data: session } = await f.admin
      .from('quiz_sessions')
      .select('id')
      .eq('id', sessionId)
      .single()
    expect(session?.id).toBe(sessionId)
    expect(await progressRows(f, sessionId)).toHaveLength(0)
  })

  it('refuses a multiple-choice option outside a to d', async () => {
    const sessionId = await startPractice(f, 'quick_quiz', [f.mcIds[0] ?? ''])
    const { error } = await save(sessionId, f.mcIds[0] ?? '', { selected_option_id: 'z' })
    expect(error?.message).toContain('invalid_answer')
    expect(await progressRows(f, sessionId)).toHaveLength(0)
  })

  it('accepts a multi-byte answer at exactly 128 KiB and refuses one a byte over', async () => {
    // stored text is {"response_text": "<text>"}: 21 bytes of wrapper, 2 bytes per Cyrillic char
    const cap = 131072
    const fill = 'ж'.repeat((cap - 21 - 1) / 2)
    const sessionId = await startPractice(f, 'quick_quiz', [f.shortId])
    const atCap = `${fill}x`
    const ok = await save(sessionId, f.shortId, { response_text: atCap })
    expect(ok.error).toBeNull()
    const { error } = await save(sessionId, f.shortId, { response_text: `${atCap}x` })
    expect(error?.message).toContain('invalid_answer')
    const rows = await progressRows(f, sessionId)
    expect(rows[0]?.answer).toEqual({ response_text: atCap })
  })

  it('refuses a time outside 0 to 24 hours and a missing time', async () => {
    const sessionId = await startPractice(f, 'quick_quiz', f.mcIds.slice(0, 2))
    for (const ms of [-1, 86_400_001]) {
      const { error } = await save(sessionId, f.mcIds[0]!, { selected_option_id: 'a' }, ms)
      expect(error?.message, `ms=${ms}`).toContain('invalid_time_spent')
    }
    const { error: nullErr } = await save(
      sessionId,
      f.mcIds[0]!,
      { selected_option_id: 'a' },
      null as unknown as number,
    )
    expect(nullErr?.message).toContain('invalid_time_spent')
    expect(await progressRows(f, sessionId)).toHaveLength(0)
  })

  it('refuses a question that is not part of the session', async () => {
    const sessionId = await startPractice(f, 'quick_quiz', f.mcIds.slice(0, 2))
    const { error } = await save(sessionId, f.mcIds[4]!, { selected_option_id: 'a' })
    expect(error?.message).toContain('question_not_in_session')
    expect(await progressRows(f, sessionId)).toHaveLength(0)
  })

  it('stores position and pins and leaves a saved answer untouched', async () => {
    const sessionId = await startPractice(f, 'quick_quiz', f.mcIds.slice(0, 3))
    expect((await save(sessionId, f.mcIds[1]!, { selected_option_id: 'a' }, 3000)).error).toBeNull()

    const { error } = await f.student.rpc('save_quiz_position', {
      p_session_id: sessionId,
      p_current_index: 2,
      p_pinned_question_ids: [f.mcIds[0], f.mcIds[0], f.mcIds[2]],
      p_device_id: DEVICE,
      p_question_id: f.mcIds[1],
      p_time_spent_ms: 8000,
    })
    expect(error).toBeNull()

    const progress = await load(sessionId)
    expect(progress.current_index).toBe(2)
    expect([...progress.pinned_question_ids].sort()).toEqual([f.mcIds[0], f.mcIds[2]].sort())
    const row = progress.answers.find((a) => a.question_id === f.mcIds[1])
    expect(row).toMatchObject({ answer: { selected_option_id: 'a' }, time_spent_ms: 8000 })
  })

  it('records time for a viewed question without creating an answer', async () => {
    const sessionId = await startPractice(f, 'quick_quiz', f.mcIds.slice(0, 3))
    const { error } = await f.student.rpc('save_quiz_position', {
      p_session_id: sessionId,
      p_current_index: 1,
      p_pinned_question_ids: [],
      p_device_id: DEVICE,
      p_question_id: f.mcIds[0],
      p_time_spent_ms: 1500,
    })
    expect(error).toBeNull()
    const rows = await progressRows(f, sessionId)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ answer: null, time_spent_ms: 1500, answered_at: null })
  })

  it('refuses an out-of-range position and pins outside the session', async () => {
    const sessionId = await startPractice(f, 'quick_quiz', f.mcIds.slice(0, 3))
    const call = (index: number, pins: string[]) =>
      f.student.rpc('save_quiz_position', {
        p_session_id: sessionId,
        p_current_index: index,
        p_pinned_question_ids: pins,
        p_device_id: DEVICE,
      })
    expect((await call(1, [f.mcIds[0]!])).error).toBeNull()
    expect((await call(3, [])).error?.message).toContain('invalid_position')
    expect((await call(-1, [])).error?.message).toContain('invalid_position')
    expect((await call(0, [f.mcIds[4]!])).error?.message).toContain('question_not_in_session')

    const progress = await load(sessionId)
    expect(progress.current_index).toBe(1)
    expect(progress.pinned_question_ids).toEqual([f.mcIds[0]])
  })

  it('refuses a null pin and keeps the stored pins unchanged', async () => {
    const sessionId = await startPractice(f, 'quick_quiz', f.mcIds.slice(0, 3))
    const call = (pins: Array<string | null>) =>
      f.student.rpc('save_quiz_position', {
        p_session_id: sessionId,
        p_current_index: 0,
        p_pinned_question_ids: pins,
        p_device_id: DEVICE,
      })
    expect((await call([f.mcIds[0]!])).error).toBeNull()
    expect((await load(sessionId)).pinned_question_ids).toEqual([f.mcIds[0]])

    expect((await call([null])).error?.message).toContain('question_not_in_session')
    expect((await call([f.mcIds[1]!, null])).error?.message).toContain('question_not_in_session')

    expect((await load(sessionId)).pinned_question_ids).toEqual([f.mcIds[0]])
  })

  it.each(['smart_review', 'mock_exam', 'internal_exam', 'vfr_rt_exam'] as const)(
    'accepts progress writes in %s mode',
    async (mode) => {
      const ids = f.mcIds.slice(0, 2)
      const sessionId =
        mode === 'smart_review'
          ? await startPractice(f, 'smart_review', ids)
          : await insertSession({ f, mode, questionIds: ids, timeLimitSeconds: 1800 })
      const { error } = await save(sessionId, f.mcIds[0]!, { selected_option_id: 'a' })
      expect(error).toBeNull()
      expect(await progressRows(f, sessionId)).toHaveLength(1)
    },
  )
})
