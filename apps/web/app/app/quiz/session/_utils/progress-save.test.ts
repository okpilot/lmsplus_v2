import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockSaveAnswer, mockSavePosition, mockClassify } = vi.hoisted(() => ({
  mockSaveAnswer: vi.fn(),
  mockSavePosition: vi.fn(),
  mockClassify: vi.fn(),
}))

vi.mock('../../actions/quiz-progress', () => ({
  saveQuizAnswer: (...a: unknown[]) => mockSaveAnswer(...a),
  saveQuizPosition: (...a: unknown[]) => mockSavePosition(...a),
}))

vi.mock('./classify-failure', () => ({
  classifyFailure: (...a: unknown[]) => mockClassify(...a),
}))

import {
  INVALID_INPUT,
  PROGRESS_ERROR_MESSAGES,
  SIGN_IN,
} from '../../actions/progress-error-messages'
import { _resetConnectionState } from './connection-state'
import {
  buildAnswerInput,
  buildPositionInput,
  clampTimeSpent,
  fireProgressSave,
} from './progress-save'
import { _resetRefusedSave, retryRefusedSave, skipRefusedSave } from './refused-save'
import { _resetSessionTakeover, markTakenOver } from './session-takeover'
import { _resetWithReconnect } from './with-reconnect'

const MAPPED = 'This session has already ended.'

beforeEach(() => {
  vi.resetAllMocks()
  mockClassify.mockResolvedValue('server')
  _resetConnectionState()
  _resetWithReconnect()
  _resetSessionTakeover()
  _resetRefusedSave()
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

  it('sends nothing once the session was taken over', async () => {
    markTakenOver('s')
    const h = handlers()
    fireProgressSave({ kind: 'answer', sessionId: 's', input: {}, ...h })
    fireProgressSave({ kind: 'position', sessionId: 's', input: {}, ...h })
    await settle()
    expect(mockSaveAnswer).not.toHaveBeenCalled()
    expect(mockSavePosition).not.toHaveBeenCalled()
    expect(h.onSuccess).not.toHaveBeenCalled()
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
    mockSavePosition.mockRejectedValue(new Error('offline'))
    const h = handlers()
    fireProgressSave({ kind: 'position', sessionId: 's', input: {}, ...h })
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

  const fire = () => fireProgressSave({ kind: 'answer', sessionId: 's', input: {}, ...handlers() })

  const firePosition = () =>
    fireProgressSave({ kind: 'position', sessionId: 's', input: {}, ...handlers() })

  it('reports saved when the save succeeded', async () => {
    mockSaveAnswer.mockResolvedValue({ success: true })
    await expect(fire()).resolves.toBe('saved')
  })

  it('reports rejected and shows the copy when the server refuses with a mapped message', async () => {
    mockSaveAnswer.mockResolvedValue({ success: false, error: MAPPED })
    const h = handlers()
    await expect(
      fireProgressSave({ kind: 'answer', sessionId: 's', input: {}, ...h }),
    ).resolves.toBe('rejected')
    expect(h.onMappedError).toHaveBeenCalledWith(MAPPED)
  })

  it('reports rejected when the server refuses the input as invalid', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockSavePosition.mockResolvedValue({ success: false, error: INVALID_INPUT })
    await expect(firePosition()).resolves.toBe('rejected')
  })

  it('reports failed for an unmapped failure', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockSavePosition.mockResolvedValue({ success: false, error: 'Could not save progress' })
    await expect(firePosition()).resolves.toBe('failed')
  })

  it('reports failed when a position save throws', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockSavePosition.mockImplementation(() => {
      throw new Error('boom')
    })
    await expect(firePosition()).resolves.toBe('failed')
  })

  it('reports failed without sending once the session was taken over', async () => {
    markTakenOver('s')
    await expect(fire()).resolves.toBe('failed')
    expect(mockSaveAnswer).not.toHaveBeenCalled()
  })

  it('reports failed and shows nothing when the server reports a takeover', async () => {
    mockSaveAnswer.mockResolvedValue({
      success: false,
      error: PROGRESS_ERROR_MESSAGES.session_taken_over,
    })
    const h = handlers()
    await expect(
      fireProgressSave({ kind: 'answer', sessionId: 's', input: {}, ...h }),
    ).resolves.toBe('failed')
    expect(h.onMappedError).not.toHaveBeenCalled()
  })

  it('reports failed and shows nothing when the sign-in expired', async () => {
    mockClassify.mockResolvedValue('signed-out')
    mockSaveAnswer.mockResolvedValue({ success: false, error: SIGN_IN })
    const h = handlers()
    await expect(
      fireProgressSave({ kind: 'answer', sessionId: 's', input: {}, ...h }),
    ).resolves.toBe('failed')
    expect(h.onMappedError).not.toHaveBeenCalled()
  })
})

describe('fireProgressSave on a held answer save', () => {
  const fireAnswer = () =>
    fireProgressSave({
      kind: 'answer',
      sessionId: 's',
      input: {},
      onSuccess: vi.fn(),
      onMappedError: vi.fn(),
    })

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows a failed input parse inline instead of holding the answer', async () => {
    mockSaveAnswer.mockResolvedValue({ success: false, error: INVALID_INPUT })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const outcome = fireAnswer()
    await vi.advanceTimersByTimeAsync(0)
    await expect(outcome).resolves.toBe('rejected')
    expect(mockSaveAnswer).toHaveBeenCalledTimes(1)
  })

  it('settles as rejected when the student continues without a persistent transient failure', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockSaveAnswer.mockResolvedValue({ success: false, error: 'Could not save progress' })
    const outcome = fireAnswer()
    await vi.advanceTimersByTimeAsync(2000)
    await vi.advanceTimersByTimeAsync(4000)
    expect(mockSaveAnswer).toHaveBeenCalledTimes(3)
    skipRefusedSave()
    await expect(outcome).resolves.toBe('rejected')
    expect(mockSaveAnswer).toHaveBeenCalledTimes(3)
  })

  it('resends a held answer on Try again and reports saved once it lands', async () => {
    mockSaveAnswer
      .mockResolvedValueOnce({ success: false, error: 'Could not save progress' })
      .mockResolvedValueOnce({ success: false, error: 'Could not save progress' })
      .mockResolvedValueOnce({ success: false, error: 'Could not save progress' })
      .mockResolvedValueOnce({ success: true })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const outcome = fireAnswer()
    await vi.advanceTimersByTimeAsync(6000)
    retryRefusedSave()
    await expect(outcome).resolves.toBe('saved')
    expect(mockSaveAnswer).toHaveBeenCalledTimes(4)
  })
})
