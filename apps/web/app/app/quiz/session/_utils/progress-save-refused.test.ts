import { beforeEach, describe, expect, it, vi } from 'vitest'

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

import { _resetConnectionState, getConnectionStatus } from './connection-state'
import { fireProgressSave } from './progress-save'
import { _resetRefusedSave, retryRefusedSave, skipRefusedSave } from './refused-save'
import { _resetSessionTakeover } from './session-takeover'
import { _resetWithReconnect } from './with-reconnect'

const BAD_ANSWER = 'This answer could not be saved. Please review it and try again.'
const handlers = () => ({ onSuccess: vi.fn(), onMappedError: vi.fn() })
const flush = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  vi.resetAllMocks()
  mockClassify.mockResolvedValue('server')
  _resetConnectionState()
  _resetWithReconnect()
  _resetRefusedSave()
  _resetSessionTakeover()
})

describe('fireProgressSave with a refused save', () => {
  it('holds an answer save the server refuses until the student chooses', async () => {
    mockSaveAnswer.mockResolvedValue({ success: false, error: BAD_ANSWER })
    fireProgressSave({ kind: 'answer', sessionId: 's', input: {}, ...handlers() })
    await flush()
    expect(getConnectionStatus()).toBe('save-failed')
    skipRefusedSave()
  })

  it('resends the answer when the student chooses Try again', async () => {
    mockSaveAnswer
      .mockResolvedValueOnce({ success: false, error: BAD_ANSWER })
      .mockResolvedValue({ success: true })
    const h = handlers()
    fireProgressSave({ kind: 'answer', sessionId: 's', input: { a: 1 }, ...h })
    await flush()
    retryRefusedSave()
    await flush()
    expect(mockSaveAnswer).toHaveBeenCalledTimes(2)
    expect(h.onSuccess).toHaveBeenCalledTimes(1)
    expect(getConnectionStatus()).not.toBe('save-failed')
  })

  it('shows the refusal copy after the student continues without the answer', async () => {
    mockSaveAnswer.mockResolvedValue({ success: false, error: BAD_ANSWER })
    const h = handlers()
    fireProgressSave({ kind: 'answer', sessionId: 's', input: {}, ...h })
    await flush()
    skipRefusedSave()
    await flush()
    expect(h.onMappedError).toHaveBeenCalledWith(BAD_ANSWER)
  })

  it('does not hold a position save the server refuses', async () => {
    mockSavePosition.mockResolvedValue({ success: false, error: BAD_ANSWER })
    const h = handlers()
    fireProgressSave({ kind: 'position', sessionId: 's', input: {}, ...h })
    await flush()
    expect(getConnectionStatus()).not.toBe('save-failed')
    expect(h.onMappedError).toHaveBeenCalledWith(BAD_ANSWER)
  })
})
