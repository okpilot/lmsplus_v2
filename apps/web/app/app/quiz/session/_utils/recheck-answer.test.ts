import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCheck, mockCheckNonMc } = vi.hoisted(() => ({
  mockCheck: vi.fn(),
  mockCheckNonMc: vi.fn(),
}))

vi.mock('../../actions/check-answer', () => ({ checkAnswer: (...a: unknown[]) => mockCheck(...a) }))
vi.mock('../../actions/check-non-mc-answer', () => ({
  checkNonMcAnswer: (...a: unknown[]) => mockCheckNonMc(...a),
}))
vi.mock('../../actions/quiz-progress', () => ({ saveQuizAnswer: vi.fn() }))
vi.mock('./claim-quiz-device', () => ({
  withTakeoverCheck: (_id: string, fn: () => unknown) => fn(),
}))
vi.mock('./with-reconnect', () => ({ withReconnect: (fn: () => unknown) => fn() }))
vi.mock('./quiz-device-id', () => ({ getQuizDeviceId: () => 'device-1' }))

import { recheckAnswer } from './recheck-answer'

const base = { sessionId: 's1', questionId: 'q1' }

beforeEach(() => vi.resetAllMocks())

describe('recheckAnswer', () => {
  it('re-checks a multiple choice answer without a visit time so stored time is untouched', async () => {
    mockCheck.mockResolvedValue({
      success: true,
      isCorrect: false,
      correctOptionId: 'c',
      explanationText: 'why',
      explanationImageUrl: null,
    })

    const result = await recheckAnswer({
      ...base,
      answer: { selectedOptionId: 'a', responseTimeMs: 4000 },
    })

    expect(mockCheck).toHaveBeenCalledWith({
      questionId: 'q1',
      selectedOptionId: 'a',
      sessionId: 's1',
      deviceId: 'device-1',
    })
    expect(result).toEqual({
      questionType: 'multiple_choice',
      isCorrect: false,
      correctOptionId: 'c',
      explanationText: 'why',
      explanationImageUrl: null,
    })
  })

  it('re-checks a non multiple choice answer through the non multiple choice check', async () => {
    mockCheckNonMc.mockResolvedValue({
      success: true,
      questionType: 'short_answer',
      isCorrect: true,
      correctAnswer: 'qnh',
      explanationText: null,
      explanationImageUrl: null,
    })

    const result = await recheckAnswer({
      ...base,
      answer: { responseText: 'QNH', responseTimeMs: 10 },
    })

    expect(mockCheckNonMc).toHaveBeenCalledWith({
      questionId: 'q1',
      sessionId: 's1',
      deviceId: 'device-1',
      responseText: 'QNH',
    })
    expect(result).toEqual({
      questionType: 'short_answer',
      isCorrect: true,
      correctAnswer: 'qnh',
      explanationText: null,
      explanationImageUrl: null,
    })
  })

  it('gives no feedback when the server refuses the check', async () => {
    mockCheck.mockResolvedValue({ success: false, error: 'This session has already ended.' })

    expect(
      await recheckAnswer({ ...base, answer: { selectedOptionId: 'a', responseTimeMs: 1 } }),
    ).toBeNull()
  })

  it('gives no feedback when the check throws', async () => {
    mockCheck.mockRejectedValue(new Error('network'))

    expect(
      await recheckAnswer({ ...base, answer: { selectedOptionId: 'a', responseTimeMs: 1 } }),
    ).toBeNull()
  })

  it('gives no feedback for a draft that carries no answer', async () => {
    expect(await recheckAnswer({ ...base, answer: { responseTimeMs: 1 } })).toBeNull()
    expect(mockCheck).not.toHaveBeenCalled()
    expect(mockCheckNonMc).not.toHaveBeenCalled()
  })
})
