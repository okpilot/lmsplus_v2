import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockSaveAnswer, mockSavePosition } = vi.hoisted(() => ({
  mockSaveAnswer: vi.fn(),
  mockSavePosition: vi.fn(),
}))

vi.mock('../../actions/quiz-progress', () => ({
  saveQuizAnswer: (...a: unknown[]) => mockSaveAnswer(...a),
  saveQuizPosition: (...a: unknown[]) => mockSavePosition(...a),
}))

import {
  buildAnswerInput,
  buildPositionInput,
  clampTimeSpent,
  fireProgressSave,
} from './progress-save'

const MAPPED = 'This session has already ended.'

beforeEach(() => {
  vi.resetAllMocks()
})

describe('clampTimeSpent', () => {
  it.each([
    [-5, 0],
    [Number.NaN, 0],
    [Number.POSITIVE_INFINITY, 0],
    [1234.9, 1234],
    [999_999_999, 86_400_000],
  ])('turns %s into %s', (input, expected) => {
    expect(clampTimeSpent(input)).toBe(expected)
  })
})

describe('buildAnswerInput', () => {
  const base = { sessionId: 's', deviceId: 'd', questionId: 'q', timeSpentMs: 5000.7 }

  it.each([
    [{ selectedOptionId: 'a' }, { selectedOptionId: 'a' }],
    [{ responseText: '' }, { responseText: '' }],
    [{ blankAnswers: [{ index: 0, text: 'x' }] }, { blankAnswers: [{ index: 0, text: 'x' }] }],
    [{ order: ['1', '2'] }, { order: ['1', '2'] }],
    [{ mapping: [{ zoneId: 'z', labelId: 'l' }] }, { mapping: [{ zoneId: 'z', labelId: 'l' }] }],
  ])('maps the draft %j to its answer payload', (draft, answer) => {
    expect(buildAnswerInput({ ...base, draft })).toEqual({
      sessionId: 's',
      questionId: 'q',
      deviceId: 'd',
      answer,
      timeSpentMs: 5000,
    })
  })

  it('returns null for a draft that carries no answer', () => {
    expect(buildAnswerInput({ ...base, draft: {} })).toBeNull()
  })
})

describe('buildPositionInput', () => {
  it('carries the pins as an array and the question being left with a clamped time', () => {
    expect(
      buildPositionInput({
        sessionId: 's',
        deviceId: 'd',
        currentIndex: 2,
        pinnedQuestionIds: new Set(['p1']),
        leaving: { questionId: 'q', timeSpentMs: -1 },
      }),
    ).toEqual({
      sessionId: 's',
      deviceId: 'd',
      currentIndex: 2,
      pinnedQuestionIds: ['p1'],
      leaving: { questionId: 'q', timeSpentMs: 0 },
    })
  })

  it('omits leaving when no question is being left', () => {
    const input = buildPositionInput({
      sessionId: 's',
      deviceId: 'd',
      currentIndex: 0,
      pinnedQuestionIds: [],
    })
    expect(input).not.toHaveProperty('leaving')
  })
})

describe('fireProgressSave', () => {
  const handlers = () => ({ onSuccess: vi.fn(), onMappedError: vi.fn() })
  const settle = () => new Promise((r) => setTimeout(r, 0))

  it('routes an answer save to saveQuizAnswer and reports success', async () => {
    mockSaveAnswer.mockResolvedValue({ success: true })
    const h = handlers()
    fireProgressSave({ kind: 'answer', sessionId: 's', input: { a: 1 }, ...h })
    await settle()
    expect(mockSaveAnswer).toHaveBeenCalledWith({ a: 1 })
    expect(h.onSuccess).toHaveBeenCalledTimes(1)
  })

  it('routes a position save to saveQuizPosition', async () => {
    mockSavePosition.mockResolvedValue({ success: true })
    fireProgressSave({ kind: 'position', sessionId: 's', input: { p: 1 }, ...handlers() })
    await settle()
    expect(mockSavePosition).toHaveBeenCalledWith({ p: 1 })
    expect(mockSaveAnswer).not.toHaveBeenCalled()
  })

  it('shows mapped failure copy to the student', async () => {
    mockSavePosition.mockResolvedValue({ success: false, error: MAPPED })
    const h = handlers()
    fireProgressSave({ kind: 'position', sessionId: 's', input: {}, ...h })
    await settle()
    expect(h.onMappedError).toHaveBeenCalledWith(MAPPED)
  })

  it('only warns for an unmapped failure', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockSavePosition.mockResolvedValue({ success: false, error: 'Could not save progress' })
    const h = handlers()
    fireProgressSave({ kind: 'position', sessionId: 's', input: {}, ...h })
    await settle()
    expect(h.onMappedError).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalled()
  })

  it('only warns when the network call rejects', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockSaveAnswer.mockRejectedValue(new Error('offline'))
    const h = handlers()
    fireProgressSave({ kind: 'answer', sessionId: 's', input: {}, ...h })
    await settle()
    expect(h.onMappedError).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalled()
  })

  it('does not throw when the action throws synchronously', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockSaveAnswer.mockImplementation(() => {
      throw new Error('boom')
    })
    expect(() =>
      fireProgressSave({ kind: 'answer', sessionId: 's', input: {}, ...handlers() }),
    ).not.toThrow()
  })
})
