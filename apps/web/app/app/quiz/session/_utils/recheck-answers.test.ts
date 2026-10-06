import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockAction } = vi.hoisted(() => ({ mockAction: vi.fn() }))

vi.mock('../../actions/recheck-answers', () => ({
  recheckRestoredAnswers: (...a: unknown[]) => mockAction(...a),
}))
vi.mock('./claim-quiz-device', () => ({
  withTakeoverCheck: (_id: string, fn: () => unknown) => fn(),
}))
vi.mock('./with-reconnect', () => ({ withReconnect: (fn: () => unknown) => fn() }))
vi.mock('./quiz-device-id', () => ({ getQuizDeviceId: () => 'device-1' }))

import { recheckAnswers } from './recheck-answers'

const MC_FEEDBACK = {
  questionType: 'multiple_choice',
  isCorrect: false,
  correctOptionId: 'c',
  explanationText: 'why',
  explanationImageUrl: null,
}

function restorable(count: number) {
  return Object.fromEntries(
    Array.from({ length: count }, (_, i) => [
      `q${i}`,
      { selectedOptionId: 'a', responseTimeMs: 4000 },
    ]),
  )
}

beforeEach(() => vi.resetAllMocks())

describe('recheckAnswers', () => {
  it('sends the restored answers without any visit time so stored time is untouched', async () => {
    mockAction.mockResolvedValue({ success: true, done: false, feedback: { q1: MC_FEEDBACK } })

    const result = await recheckAnswers({
      sessionId: 's1',
      restorable: {
        q1: { selectedOptionId: 'a', responseTimeMs: 4000 },
        q2: { responseText: 'QNH', responseTimeMs: 10 },
      },
    })

    expect(mockAction).toHaveBeenCalledWith({
      sessionId: 's1',
      deviceId: 'device-1',
      answers: [
        { questionId: 'q1', selectedOptionId: 'a' },
        { questionId: 'q2', responseText: 'QNH' },
      ],
    })
    expect(JSON.stringify(mockAction.mock.calls)).not.toContain('timeSpentMs')
    expect(result.get('q1')).toEqual(MC_FEEDBACK)
  })

  it('skips a draft that carries no answer', async () => {
    mockAction.mockResolvedValue({ success: true, done: false, feedback: {} })

    await recheckAnswers({
      sessionId: 's1',
      restorable: { q1: { responseTimeMs: 1 }, q2: { selectedOptionId: 'b', responseTimeMs: 1 } },
    })

    expect(mockAction.mock.calls[0]?.[0].answers).toEqual([
      { questionId: 'q2', selectedOptionId: 'b' },
    ])
  })

  it('makes no call when no draft carries an answer', async () => {
    const result = await recheckAnswers({
      sessionId: 's1',
      restorable: { q1: { responseTimeMs: 1 } },
    })

    expect(mockAction).not.toHaveBeenCalled()
    expect(result.size).toBe(0)
  })

  it('sends 25 answers per call and merges the feedback of every call', async () => {
    mockAction.mockImplementation(async (input: { answers: { questionId: string }[] }) => ({
      success: true,
      feedback: Object.fromEntries(input.answers.map((a) => [a.questionId, MC_FEEDBACK])),
    }))

    const result = await recheckAnswers({ sessionId: 's1', restorable: restorable(60) })

    expect(mockAction.mock.calls.map((c) => c[0].answers.length)).toEqual([25, 25, 10])
    expect(result.size).toBe(60)
  })

  it('sends the next call only after the previous one settles, so a new answer waits behind one call', async () => {
    const releases: (() => void)[] = []
    mockAction.mockImplementation(
      () =>
        new Promise((resolve) => {
          releases.push(() => resolve({ success: true, done: false, feedback: {} }))
        }),
    )

    const pending = recheckAnswers({ sessionId: 's1', restorable: restorable(60) })
    await Promise.resolve()
    expect(mockAction).toHaveBeenCalledTimes(1)

    for (let call = 0; call < 3; call++) {
      releases[call]?.()
      await vi.waitFor(() => expect(mockAction.mock.calls.length).toBeGreaterThan(call))
    }
    await pending
    expect(mockAction).toHaveBeenCalledTimes(3)
  })

  it('stops after a refused call and keeps the feedback graded before it', async () => {
    mockAction
      .mockResolvedValueOnce({ success: true, done: false, feedback: { q0: MC_FEEDBACK } })
      .mockResolvedValueOnce({ success: false, error: 'This session has already ended.' })

    const result = await recheckAnswers({ sessionId: 's1', restorable: restorable(80) })

    expect(mockAction).toHaveBeenCalledTimes(2)
    expect([...result.keys()]).toEqual(['q0'])
  })

  it('stops after a call throws and keeps the feedback graded before it', async () => {
    mockAction
      .mockResolvedValueOnce({ success: true, done: false, feedback: { q0: MC_FEEDBACK } })
      .mockRejectedValueOnce(new Error('network'))

    const result = await recheckAnswers({ sessionId: 's1', restorable: restorable(80) })

    expect(mockAction).toHaveBeenCalledTimes(2)
    expect([...result.keys()]).toEqual(['q0'])
  })

  it('keeps the feedback of a call that reports the session done, then stops', async () => {
    mockAction.mockResolvedValueOnce({ success: true, done: true, feedback: { q0: MC_FEEDBACK } })

    const result = await recheckAnswers({ sessionId: 's1', restorable: restorable(60) })

    expect(mockAction).toHaveBeenCalledTimes(1)
    expect([...result.keys()]).toEqual(['q0'])
  })

  it('gives no feedback when the call throws', async () => {
    mockAction.mockRejectedValue(new Error('network'))

    const result = await recheckAnswers({ sessionId: 's1', restorable: restorable(2) })

    expect(result.size).toBe(0)
  })
})
