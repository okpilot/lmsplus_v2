import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockSaveAnswer, mockClassify } = vi.hoisted(() => ({
  mockSaveAnswer: vi.fn(),
  mockClassify: vi.fn(),
}))

vi.mock('../../actions/quiz-progress', () => ({
  saveQuizAnswer: (...a: unknown[]) => mockSaveAnswer(...a),
  saveQuizPosition: vi.fn(),
}))

vi.mock('./classify-failure', () => ({
  classifyFailure: (...a: unknown[]) => mockClassify(...a),
}))

import { _resetConnectionState } from './connection-state'
import { resendUnsavedAnswers, sendAnswerSave } from './progress-sync-saves'
import { _resetRefusedSave, skipRefusedSave } from './refused-save'
import { _resetSessionTakeover } from './session-takeover'
import { _resetUnsavedAnswers } from './unsaved-answers'
import { _resetWithReconnect } from './with-reconnect'

const SESSION = '00000000-0000-4000-a000-000000000001'
const QID = '00000000-0000-4000-a000-000000000011'

beforeEach(() => {
  vi.resetAllMocks()
  vi.useFakeTimers()
  mockClassify.mockResolvedValue('server')
  _resetConnectionState()
  _resetWithReconnect()
  _resetSessionTakeover()
  _resetRefusedSave()
  _resetUnsavedAnswers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Finish after the student continued without a held answer save', () => {
  it('has nothing left to resend', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockSaveAnswer.mockResolvedValue({ success: false, error: 'Could not save progress' })
    sendAnswerSave({
      sessionId: SESSION,
      questionId: QID,
      draft: { selectedOptionId: 'a' },
      startedAt: Date.now(),
      onSuccess: vi.fn(),
      onMappedError: vi.fn(),
    })
    await vi.advanceTimersByTimeAsync(2000)
    await vi.advanceTimersByTimeAsync(4000)
    expect(mockSaveAnswer).toHaveBeenCalledTimes(3)
    skipRefusedSave()
    await vi.advanceTimersByTimeAsync(0)

    const saved = await resendUnsavedAnswers({ sessionId: SESSION, onMappedError: vi.fn() })

    expect(saved).toBe(true)
    expect(mockSaveAnswer).toHaveBeenCalledTimes(3)
  })

  it('has nothing left to resend when the save kept throwing', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockSaveAnswer.mockRejectedValue(new Error('server blew up'))
    sendAnswerSave({
      sessionId: SESSION,
      questionId: QID,
      draft: { selectedOptionId: 'a' },
      startedAt: Date.now(),
      onSuccess: vi.fn(),
      onMappedError: vi.fn(),
    })
    await vi.advanceTimersByTimeAsync(6000)
    skipRefusedSave()
    await vi.advanceTimersByTimeAsync(0)

    const saved = await resendUnsavedAnswers({ sessionId: SESSION, onMappedError: vi.fn() })

    expect(saved).toBe(true)
    expect(mockSaveAnswer).toHaveBeenCalledTimes(3)
  })
})
