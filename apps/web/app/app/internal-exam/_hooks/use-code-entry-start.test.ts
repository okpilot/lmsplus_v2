import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPush, mockStartInternalExam, mockGetActivePracticeSession, mockRoom } = vi.hoisted(
  () => ({
    mockPush: vi.fn(),
    mockStartInternalExam: vi.fn(),
    mockGetActivePracticeSession: vi.fn(),
    mockRoom: vi.fn(),
  }),
)

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }))
vi.mock('../actions/start-internal-exam', () => ({
  startInternalExam: (...args: unknown[]) => mockStartInternalExam(...args),
}))
vi.mock('@/app/app/quiz/actions/get-active-practice-session', () => ({
  getActivePracticeSession: (...args: unknown[]) => mockGetActivePracticeSession(...args),
}))
vi.mock('@/app/app/quiz/actions/quiz-progress', () => ({
  claimQuizSession: vi.fn().mockResolvedValue({ success: true }),
}))
vi.mock('@/app/app/quiz/actions/saved-quiz', () => ({
  saveQuizForLater: vi.fn().mockResolvedValue({ success: true }),
  checkSavedQuizRoom: (...args: unknown[]) => mockRoom(...args),
}))

import { useCodeEntryStart } from './use-code-entry-start'

beforeEach(() => {
  vi.resetAllMocks()
})

describe('useCodeEntryStart', () => {
  it('navigates to /app/quiz/session/<id>, never calls sessionStorage.setItem, never reads localStorage', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const getItem = vi.spyOn(Storage.prototype, 'getItem')
    mockStartInternalExam.mockResolvedValue({ success: true, sessionId: 'sess-1' })
    const { result } = renderHook(() => useCodeEntryStart('ABCD2345'))

    act(() => result.current.start())

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/app/quiz/session/sess-1'))
    expect(mockStartInternalExam).toHaveBeenCalledWith({ code: 'ABCD2345' })
    expect(setItem).not.toHaveBeenCalled()
    expect(getItem).not.toHaveBeenCalled()
  })

  it('shows the server error and allows a retry after a failed start', async () => {
    mockStartInternalExam.mockResolvedValue({ success: false, error: 'Code expired.' })
    const { result } = renderHook(() => useCodeEntryStart('ABCD2345'))

    act(() => result.current.start())
    await waitFor(() => expect(result.current.error).toBe('Code expired.'))

    act(() => result.current.start())
    await waitFor(() => expect(mockStartInternalExam).toHaveBeenCalledTimes(2))
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('shows a generic error and allows a retry when the start throws', async () => {
    mockStartInternalExam.mockRejectedValueOnce(new Error('boom'))
    const { result } = renderHook(() => useCodeEntryStart('ABCD2345'))

    act(() => result.current.start())
    await waitFor(() =>
      expect(result.current.error).toBe('Something went wrong. Please try again.'),
    )

    mockStartInternalExam.mockResolvedValue({ success: true, sessionId: 'sess-2' })
    act(() => result.current.start())
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/app/quiz/session/sess-2'))
  })

  it('starts once when invoked twice in the same tick', () => {
    mockStartInternalExam.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useCodeEntryStart('ABCD2345'))

    act(() => {
      result.current.start()
      result.current.start()
    })

    expect(mockStartInternalExam).toHaveBeenCalledTimes(1)
  })

  it('offers to save the blocking practice quiz when the start is blocked', async () => {
    mockStartInternalExam.mockResolvedValue({
      success: false,
      error: 'Another session is active',
      blocked: true,
    })
    mockGetActivePracticeSession.mockResolvedValue({
      success: true,
      session: { sessionId: 'blocker-1', subjectName: 'Air Law' },
    })
    const { result } = renderHook(() => useCodeEntryStart('ABCD2345'))

    act(() => result.current.start())

    await waitFor(() =>
      expect(result.current.blocked.offer).toEqual({
        sessionId: 'blocker-1',
        subjectName: 'Air Law',
      }),
    )
    expect(result.current.error).toBe('Another session is active')
  })

  it('clears the error and the offer on reset', async () => {
    mockStartInternalExam.mockResolvedValue({ success: false, error: 'Code expired.' })
    const { result } = renderHook(() => useCodeEntryStart('ABCD2345'))
    act(() => result.current.start())
    await waitFor(() => expect(result.current.error).toBe('Code expired.'))

    act(() => result.current.reset())

    expect(result.current.error).toBeNull()
    expect(result.current.blocked.offer).toBeNull()
  })

  it('clears an earlier save-for-later error when the dialog is reset', async () => {
    mockStartInternalExam.mockResolvedValue({
      success: false,
      error: 'Another session is active',
      blocked: true,
    })
    mockGetActivePracticeSession.mockResolvedValue({
      success: true,
      session: { sessionId: 'blocker-1', subjectName: 'Air Law' },
    })
    mockRoom.mockResolvedValue({ success: false, error: 'You can keep up to 20 saved quizzes.' })
    const { result } = renderHook(() => useCodeEntryStart('ABCD2345'))
    act(() => result.current.start())
    await waitFor(() => expect(result.current.blocked.offer).not.toBeNull())
    await act(async () => result.current.blocked.onAccept())
    await waitFor(() =>
      expect(result.current.blocked.error).toBe('You can keep up to 20 saved quizzes.'),
    )

    act(() => result.current.reset())

    expect(result.current.blocked.error).toBeNull()
  })
})
