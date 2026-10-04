import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCheckAnswer, mockCheckNonMcAnswer, mockClassify } = vi.hoisted(() => ({
  mockCheckAnswer: vi.fn(),
  mockCheckNonMcAnswer: vi.fn(),
  mockClassify: vi.fn(),
}))

vi.mock('../../actions/check-answer', () => ({
  checkAnswer: (...a: unknown[]) => mockCheckAnswer(...a),
}))
vi.mock('../../actions/check-non-mc-answer', () => ({
  checkNonMcAnswer: (...a: unknown[]) => mockCheckNonMcAnswer(...a),
}))
vi.mock('../_utils/classify-failure', () => ({
  classifyFailure: (...a: unknown[]) => mockClassify(...a),
}))

import { SIGN_IN } from '../../actions/progress-error-messages'
import {
  _resetConnectionState,
  getConnectionStatus,
  setConnectionStatus,
} from '../_utils/connection-state'
import { _resetSessionTakeover } from '../_utils/session-takeover'
import { _resetWithReconnect } from '../_utils/with-reconnect'
import type { AttemptInput } from './answer-handler-helpers'
import { buildAnswerHandlers, handleAnswerError } from './answer-handler-helpers'

const SESSION_ID = '00000000-0000-4000-b000-000000000001'
const Q_ID = '00000000-0000-4000-b000-000000000011'
const MC_SUCCESS = { success: true as const, isCorrect: true, correctOptionId: 'a' }

function harness() {
  const attempts: AttemptInput[] = []
  const handlers = buildAnswerHandlers({
    sessionId: SESSION_ID,
    getAnswerStartTime: () => Date.now(),
    runAttempt: async (a) => {
      attempts.push(a)
      return true
    },
  })
  return { handlers, attempts }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  sessionStorage.clear()
  _resetConnectionState()
  _resetWithReconnect()
  _resetSessionTakeover()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('answer checks while the network is down', () => {
  it('resolves a multiple-choice check with feedback once the connection returns', async () => {
    mockClassify.mockResolvedValue('offline')
    mockCheckAnswer.mockRejectedValueOnce(new TypeError('fetch failed'))
    mockCheckAnswer.mockResolvedValue(MC_SUCCESS)
    const { handlers, attempts } = harness()
    await handlers.handleSelectAnswer('a')
    const check = attempts[0]?.check(Q_ID)
    await vi.advanceTimersByTimeAsync(0)
    expect(getConnectionStatus()).toBe('offline')
    window.dispatchEvent(new Event('online'))
    await expect(check).resolves.toMatchObject({ questionType: 'multiple_choice', isCorrect: true })
  })

  it('resolves a non-multiple-choice check once the connection returns', async () => {
    mockClassify.mockResolvedValue('offline')
    mockCheckNonMcAnswer.mockRejectedValueOnce(new TypeError('fetch failed'))
    mockCheckNonMcAnswer.mockResolvedValue({
      success: true,
      questionType: 'short_answer',
      isCorrect: true,
    })
    const { handlers, attempts } = harness()
    await handlers.handleTextAnswer('x')
    const check = attempts[0]?.check(Q_ID)
    await vi.advanceTimersByTimeAsync(0)
    window.dispatchEvent(new Event('online'))
    await expect(check).resolves.toMatchObject({ questionType: 'short_answer', isCorrect: true })
  })

  it('throws the sign-in copy and flags signed-out when the sign-in expired', async () => {
    mockClassify.mockResolvedValue('signed-out')
    mockCheckAnswer.mockResolvedValue({ success: false, error: SIGN_IN })
    const { handlers, attempts } = harness()
    await handlers.handleSelectAnswer('a')
    await expect(attempts[0]?.check(Q_ID)).rejects.toThrow(SIGN_IN)
    expect(getConnectionStatus()).toBe('signed-out')
  })

  it('still throws a server rejection so the answer is reverted as before', async () => {
    mockCheckAnswer.mockResolvedValue({ success: false, error: 'This session has already ended.' })
    const { handlers, attempts } = harness()
    await handlers.handleSelectAnswer('a')
    await expect(attempts[0]?.check(Q_ID)).rejects.toThrow('This session has already ended.')
    expect(getConnectionStatus()).toBe('ok')
  })
})

describe('handleAnswerError when signed out', () => {
  function errorOpts() {
    const draft = { selectedOptionId: 'a', responseTimeMs: 1 }
    return {
      lockedRef: { current: new Set([Q_ID]) },
      answersRef: { current: new Map([[Q_ID, draft]]) },
      setAnswers: vi.fn(),
      setError: vi.fn(),
      onAnswerReverted: vi.fn(),
    }
  }

  it('keeps the answer and its lock and shows no inline error', () => {
    setConnectionStatus('signed-out')
    const o = errorOpts()
    handleAnswerError({
      sessionId: SESSION_ID,
      questionId: Q_ID,
      pendingQuestionIdRef: { current: new Set([Q_ID]) },
      ...o,
    })
    expect(o.lockedRef.current.has(Q_ID)).toBe(true)
    expect(o.answersRef.current.has(Q_ID)).toBe(true)
    expect(o.setError).not.toHaveBeenCalled()
    expect(o.onAnswerReverted).not.toHaveBeenCalled()
  })

  it('still reverts the answer and shows the error for a server failure', () => {
    const o = errorOpts()
    handleAnswerError({
      sessionId: SESSION_ID,
      questionId: Q_ID,
      pendingQuestionIdRef: { current: new Set([Q_ID]) },
      ...o,
      message: 'Failed to check answer. Please try again.',
    })
    expect(o.answersRef.current.has(Q_ID)).toBe(false)
    expect(o.setError).toHaveBeenCalledWith('Failed to check answer. Please try again.')
  })
})
