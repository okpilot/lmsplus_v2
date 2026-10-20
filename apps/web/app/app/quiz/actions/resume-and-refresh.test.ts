import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockResumeSavedQuiz, mockRefresh } = vi.hoisted(() => ({
  mockResumeSavedQuiz: vi.fn(),
  mockRefresh: vi.fn(),
}))

vi.mock('./saved-quiz', () => ({ resumeSavedQuiz: mockResumeSavedQuiz }))
vi.mock('next/cache', () => ({ refresh: mockRefresh }))

import { resumeSavedQuizAndRefresh } from './resume-and-refresh'

const INPUT = { sessionId: '00000000-0000-4000-a000-000000000001', deviceId: 'device-1' }

describe('resumeSavedQuizAndRefresh', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('re-renders the current route in the same response when the resume succeeds', async () => {
    mockResumeSavedQuiz.mockResolvedValue({ success: true })

    const result = await resumeSavedQuizAndRefresh(INPUT)

    expect(result).toEqual({ success: true })
    expect(mockResumeSavedQuiz).toHaveBeenCalledWith(INPUT)
    expect(mockRefresh).toHaveBeenCalledTimes(1)
  })

  it('returns the failure without re-rendering when the resume fails', async () => {
    const failure = { success: false, error: 'Another session is active' }
    mockResumeSavedQuiz.mockResolvedValue(failure)

    const result = await resumeSavedQuizAndRefresh(INPUT)

    expect(result).toEqual(failure)
    expect(mockRefresh).not.toHaveBeenCalled()
  })
})
