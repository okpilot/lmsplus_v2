import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks -----------------------------------------------------------------

const { mockDiscardQuiz, mockRefresh } = vi.hoisted(() => ({
  mockDiscardQuiz: vi.fn(),
  mockRefresh: vi.fn(),
}))

vi.mock('./discard', () => ({ discardQuiz: mockDiscardQuiz }))
vi.mock('next/cache', () => ({ refresh: mockRefresh }))

// ---- Subject under test ----------------------------------------------------

import { discardQuizAndRefresh } from './discard-and-refresh'

const INPUT = { sessionId: '00000000-0000-4000-a000-000000000001' }

describe('discardQuizAndRefresh', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('re-renders the current route in the same response when the discard succeeds', async () => {
    mockDiscardQuiz.mockResolvedValue({ success: true })

    const result = await discardQuizAndRefresh(INPUT)

    expect(result).toEqual({ success: true })
    expect(mockDiscardQuiz).toHaveBeenCalledWith(INPUT)
    expect(mockRefresh).toHaveBeenCalledTimes(1)
  })

  it.each([
    [
      'the session is not found',
      { success: false, error: 'Session not found or already discarded' },
    ],
    ['the mode blocks discard', { success: false, error: 'Exam sessions cannot be discarded' }],
    ['the caller is not authenticated', { success: false, error: 'Not authenticated' }],
  ])('returns the failure without re-rendering when %s', async (_label, failure) => {
    mockDiscardQuiz.mockResolvedValue(failure)

    const result = await discardQuizAndRefresh(INPUT)

    expect(result).toEqual(failure)
    expect(mockRefresh).not.toHaveBeenCalled()
  })
})
