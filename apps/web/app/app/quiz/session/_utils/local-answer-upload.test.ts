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
    const ok = await uploadLocalAnswers({ sessionId: 's1', answers: { q1: A, q2: B } })

    expect(ok).toBe(true)
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

  it('stops and reports failure at the first answer the server refuses', async () => {
    mockSave.mockResolvedValueOnce({ success: false, error: 'x' })

    const ok = await uploadLocalAnswers({ sessionId: 's1', answers: { q1: A, q2: B } })

    expect(ok).toBe(false)
    expect(mockSave).toHaveBeenCalledTimes(1)
  })

  it('reports failure when a save throws', async () => {
    mockSave.mockRejectedValueOnce(new Error('network'))

    expect(await uploadLocalAnswers({ sessionId: 's1', answers: { q1: A } })).toBe(false)
  })

  it('reports success for an empty set without calling the server', async () => {
    expect(await uploadLocalAnswers({ sessionId: 's1', answers: {} })).toBe(true)
    expect(mockSave).not.toHaveBeenCalled()
  })
})
