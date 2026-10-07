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

import { SIGN_IN } from '../../actions/progress-error-messages'
import { _resetConnectionState, getConnectionStatus } from './connection-state'
import { fireProgressSave } from './progress-save'
import { BACKOFF_MS } from './retry-wait'
import { _resetSessionTakeover } from './session-takeover'
import { _resetWithReconnect } from './with-reconnect'

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  _resetConnectionState()
  _resetWithReconnect()
  _resetSessionTakeover()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('fireProgressSave while the network is down', () => {
  it('resends the position save after reconnecting and then reports success', async () => {
    mockClassify.mockResolvedValue('offline')
    mockSavePosition.mockRejectedValueOnce(new TypeError('fetch failed'))
    mockSavePosition.mockResolvedValue({ success: true })
    const onSuccess = vi.fn()
    fireProgressSave({
      kind: 'position',
      sessionId: 's',
      input: { currentIndex: 2 },
      onSuccess,
      onMappedError: vi.fn(),
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(getConnectionStatus()).toBe('offline')
    expect(onSuccess).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(BACKOFF_MS[0] ?? 0)
    expect(mockSavePosition).toHaveBeenCalledTimes(2)
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })

  it('shows no inline error behind the overlay when the sign-in expired', async () => {
    mockClassify.mockResolvedValue('signed-out')
    mockSaveAnswer.mockResolvedValue({ success: false, error: SIGN_IN })
    const onMappedError = vi.fn()
    fireProgressSave({
      kind: 'answer',
      sessionId: 's',
      input: {},
      onSuccess: vi.fn(),
      onMappedError,
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(onMappedError).not.toHaveBeenCalled()
    expect(getConnectionStatus()).toBe('signed-out')
  })

  it('shows the inline sign-in message when the browser still has a valid session', async () => {
    mockClassify.mockResolvedValue('server')
    mockSaveAnswer.mockResolvedValue({ success: false, error: SIGN_IN })
    const onMappedError = vi.fn()
    fireProgressSave({
      kind: 'answer',
      sessionId: 's',
      input: {},
      onSuccess: vi.fn(),
      onMappedError,
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(onMappedError).toHaveBeenCalledWith(SIGN_IN)
    expect(getConnectionStatus()).toBe('ok')
  })
})
