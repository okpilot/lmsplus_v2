import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockSave } = vi.hoisted(() => ({ mockSave: vi.fn() }))

vi.mock('../../actions/quiz-progress', () => ({
  saveQuizAnswer: (...a: unknown[]) => mockSave(...a),
  saveQuizPosition: vi.fn(),
}))
vi.mock('./claim-quiz-device', () => ({
  withTakeoverCheck: (_id: string, fn: () => unknown) => fn(),
}))
vi.mock('./with-reconnect', () => ({ withReconnect: (fn: () => unknown) => fn() }))
vi.mock('./quiz-device-id', () => ({ getQuizDeviceId: () => 'device-1' }))

import { PROGRESS_ERROR_MESSAGES } from '../../actions/progress-error-messages'
import type { DraftAnswer } from '../../types'
import { findLocalOnlyAnswers, uploadLocalAnswers } from './local-answer-upload'
import type { ActiveSession } from './quiz-session-storage'

const A: DraftAnswer = { selectedOptionId: 'a', responseTimeMs: 1200 }
const B: DraftAnswer = { responseText: 'qnh', responseTimeMs: 300 }

function stored(over: Partial<ActiveSession> = {}): ActiveSession {
  return {
    userId: 'u',
    sessionId: 's1',
    questionIds: ['q1', 'q2', 'q3'],
    answers: { q1: A, q2: B },
    currentIndex: 0,
    savedAt: 1,
    ...over,
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  mockSave.mockResolvedValue({ success: true })
})

describe('findLocalOnlyAnswers', () => {
  it('returns the local answers the server does not have', () => {
    const result = findLocalOnlyAnswers({
      stored: stored(),
      sessionId: 's1',
      serverAnswers: { q1: A },
      questionIds: ['q1', 'q2', 'q3'],
    })

    expect(result).toEqual({ q2: B })
  })

  it('keeps the server answer where both exist', () => {
    const result = findLocalOnlyAnswers({
      stored: stored(),
      sessionId: 's1',
      serverAnswers: { q1: { selectedOptionId: 'd', responseTimeMs: 5 } },
      questionIds: ['q1', 'q2', 'q3'],
    })

    expect(Object.keys(result)).toEqual(['q2'])
  })

  it('ignores a local copy of another session', () => {
    expect(
      findLocalOnlyAnswers({
        stored: stored({ sessionId: 'other' }),
        sessionId: 's1',
        serverAnswers: {},
        questionIds: ['q1', 'q2'],
      }),
    ).toEqual({})
  })

  it('ignores local answers for questions outside the session', () => {
    expect(
      findLocalOnlyAnswers({
        stored: stored(),
        sessionId: 's1',
        serverAnswers: {},
        questionIds: ['q2'],
      }),
    ).toEqual({ q2: B })
  })

  it('returns nothing when there is no local copy', () => {
    expect(
      findLocalOnlyAnswers({
        stored: null,
        sessionId: 's1',
        serverAnswers: {},
        questionIds: ['q1'],
      }),
    ).toEqual({})
  })
})

describe('uploadLocalAnswers', () => {
  it('saves each local answer with its visit time for the session', async () => {
    const result = await uploadLocalAnswers({ sessionId: 's1', answers: { q1: A, q2: B } })

    expect(result).toEqual({ saved: ['q1', 'q2'], complete: true })
    expect(mockSave).toHaveBeenCalledTimes(2)
    expect(mockSave).toHaveBeenCalledWith({
      sessionId: 's1',
      questionId: 'q1',
      deviceId: 'device-1',
      answer: { selectedOptionId: 'a' },
      timeSpentMs: 1200,
    })
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({ questionId: 'q2', answer: { responseText: 'qnh' } }),
    )
  })

  it('reports each saved question to the caller as soon as the server accepts it', async () => {
    const onSaved = vi.fn()

    await uploadLocalAnswers({ sessionId: 's1', answers: { q1: A, q2: B }, onSaved })

    expect(onSaved.mock.calls).toEqual([['q1'], ['q2']])
  })

  it('sends no further answer once a stop is requested and reports the upload incomplete', async () => {
    let stop = false
    mockSave.mockImplementation(async () => {
      stop = true
      return { success: true }
    })

    const result = await uploadLocalAnswers({
      sessionId: 's1',
      answers: { q1: A, q2: B },
      shouldStop: () => stop,
    })

    expect(mockSave).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ saved: ['q1'], complete: false })
  })

  it('stops at a session-wide refusal and keeps the answers saved before it', async () => {
    mockSave.mockResolvedValueOnce({ success: true }).mockResolvedValueOnce({
      success: false,
      error: PROGRESS_ERROR_MESSAGES.session_taken_over,
    })

    const result = await uploadLocalAnswers({
      sessionId: 's1',
      answers: { q1: A, q2: B, q3: A },
    })

    expect(result).toEqual({ saved: ['q1'], complete: false })
    expect(mockSave).toHaveBeenCalledTimes(2)
  })

  it.each([
    PROGRESS_ERROR_MESSAGES.invalid_answer,
    PROGRESS_ERROR_MESSAGES.question_not_in_session,
    'Invalid input',
  ])('leaves out an answer the server rejects (%s) and uploads the rest', async (error) => {
    mockSave.mockResolvedValueOnce({ success: false, error })

    const result = await uploadLocalAnswers({ sessionId: 's1', answers: { q1: A, q2: B } })

    expect(result).toEqual({ saved: ['q2'], complete: true })
    expect(mockSave).toHaveBeenCalledTimes(2)
    expect(mockSave).toHaveBeenLastCalledWith(expect.objectContaining({ questionId: 'q2' }))
  })

  it('stops at a progress error that may apply to the whole session', async () => {
    mockSave.mockResolvedValueOnce({
      success: false,
      error: PROGRESS_ERROR_MESSAGES.invalid_device,
    })

    const result = await uploadLocalAnswers({ sessionId: 's1', answers: { q1: A, q2: B } })

    expect(result).toEqual({ saved: [], complete: false })
    expect(mockSave).toHaveBeenCalledTimes(1)
  })

  it('reports an incomplete upload with the answers saved so far when a save throws', async () => {
    mockSave.mockResolvedValueOnce({ success: true }).mockRejectedValueOnce(new Error('network'))

    const result = await uploadLocalAnswers({ sessionId: 's1', answers: { q1: A, q2: B } })

    expect(result).toEqual({ saved: ['q1'], complete: false })
  })

  it('reports a complete upload for an empty set without calling the server', async () => {
    expect(await uploadLocalAnswers({ sessionId: 's1', answers: {} })).toEqual({
      saved: [],
      complete: true,
    })
    expect(mockSave).not.toHaveBeenCalled()
  })
})
