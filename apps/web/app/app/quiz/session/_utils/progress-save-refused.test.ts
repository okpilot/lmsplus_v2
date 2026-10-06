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
  it('shows a mapped per-answer refusal inline without blocking the quiz', async () => {
    mockSaveAnswer.mockResolvedValue({ success: false, error: BAD_ANSWER })
    const h = handlers()
    const outcome = await fireProgressSave({
      kind: 'answer',
      sessionId: 's',
      input: {},
      ...h,
    })
    expect(outcome).toBe('rejected')
    expect(h.onMappedError).toHaveBeenCalledWith(BAD_ANSWER)
    expect(mockSaveAnswer).toHaveBeenCalledTimes(1)
    expect(getConnectionStatus()).not.toBe('save-failed')
  })

  it('holds an answer save with unmapped refusal copy until the student chooses', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockSaveAnswer.mockResolvedValue({ success: false, error: 'Could not save progress' })
    fireProgressSave({ kind: 'answer', sessionId: 's', input: {}, ...handlers() })
    await vi.advanceTimersByTimeAsync(6000)
    expect(getConnectionStatus()).toBe('save-failed')
    skipRefusedSave()
    vi.useRealTimers()
  })

  it('resends the answer when the student chooses Try again', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockSaveAnswer
      .mockResolvedValueOnce({ success: false, error: 'Could not save progress' })
      .mockResolvedValueOnce({ success: false, error: 'Could not save progress' })
      .mockResolvedValueOnce({ success: false, error: 'Could not save progress' })
      .mockResolvedValue({ success: true })
    const h = handlers()
    fireProgressSave({ kind: 'answer', sessionId: 's', input: { a: 1 }, ...h })
    await vi.advanceTimersByTimeAsync(6000)
    retryRefusedSave()
    await vi.advanceTimersByTimeAsync(0)
    expect(mockSaveAnswer).toHaveBeenCalledTimes(4)
    expect(h.onSuccess).toHaveBeenCalledTimes(1)
    expect(getConnectionStatus()).not.toBe('save-failed')
    vi.useRealTimers()
  })

  it('treats an answer save that keeps throwing as settled once the student continues without it', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockSaveAnswer.mockRejectedValue(new Error('server blew up'))
    const h = handlers()
    const pending = fireProgressSave({ kind: 'answer', sessionId: 's', input: {}, ...h })
    await vi.advanceTimersByTimeAsync(6000)
    expect(getConnectionStatus()).toBe('save-failed')
    skipRefusedSave()
    await expect(pending).resolves.toBe('rejected')
    expect(h.onMappedError).not.toHaveBeenCalled()
    expect(mockSaveAnswer).toHaveBeenCalledTimes(3)
    vi.useRealTimers()
  })

  it('saves the answer when a throwing save succeeds after Try again', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockSaveAnswer
      .mockRejectedValueOnce(new Error('x'))
      .mockRejectedValueOnce(new Error('x'))
      .mockRejectedValueOnce(new Error('x'))
      .mockResolvedValue({ success: true })
    const h = handlers()
    const pending = fireProgressSave({ kind: 'answer', sessionId: 's', input: {}, ...h })
    await vi.advanceTimersByTimeAsync(6000)
    retryRefusedSave()
    await expect(pending).resolves.toBe('saved')
    expect(h.onSuccess).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
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
