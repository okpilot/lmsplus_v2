import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks -----------------------------------------------------------------

const { mockDiscardQuiz, mockDiscardSavedQuiz, mockDeleteDraft, mockRefresh } = vi.hoisted(() => ({
  mockDiscardQuiz: vi.fn(),
  mockDiscardSavedQuiz: vi.fn(),
  mockDeleteDraft: vi.fn(),
  mockRefresh: vi.fn(),
}))

vi.mock('./discard', () => ({ discardQuiz: mockDiscardQuiz }))
vi.mock('./saved-quiz', () => ({ discardSavedQuiz: mockDiscardSavedQuiz }))
vi.mock('./draft-delete', () => ({ deleteDraft: mockDeleteDraft }))
vi.mock('next/cache', () => ({ refresh: mockRefresh }))

// ---- Subject under test ----------------------------------------------------

import {
  deleteDraftAndRefresh,
  discardQuizAndRefresh,
  discardSavedQuizAndRefresh,
} from './discard-and-refresh'

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

describe('discardSavedQuizAndRefresh', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('re-renders the current route in the same response when the saved quiz is deleted', async () => {
    mockDiscardSavedQuiz.mockResolvedValue({ success: true })

    const result = await discardSavedQuizAndRefresh(INPUT)

    expect(result).toEqual({ success: true })
    expect(mockDiscardSavedQuiz).toHaveBeenCalledWith(INPUT)
    expect(mockRefresh).toHaveBeenCalledTimes(1)
  })

  it('returns the failure without re-rendering when the delete fails', async () => {
    const failure = { success: false, error: 'Not authenticated' }
    mockDiscardSavedQuiz.mockResolvedValue(failure)

    const result = await discardSavedQuizAndRefresh(INPUT)

    expect(result).toEqual(failure)
    expect(mockRefresh).not.toHaveBeenCalled()
  })
})

describe('deleteDraftAndRefresh', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('re-renders the current route in the same response when the draft is deleted', async () => {
    mockDeleteDraft.mockResolvedValue({ success: true })

    const result = await deleteDraftAndRefresh({ draftId: 'd1' })

    expect(result).toEqual({ success: true })
    expect(mockDeleteDraft).toHaveBeenCalledWith({ draftId: 'd1' })
    expect(mockRefresh).toHaveBeenCalledTimes(1)
  })

  it('returns the failure without re-rendering when the draft delete fails', async () => {
    mockDeleteDraft.mockResolvedValue({ success: false })

    const result = await deleteDraftAndRefresh({ draftId: 'd1' })

    expect(result).toEqual({ success: false })
    expect(mockRefresh).not.toHaveBeenCalled()
  })
})
