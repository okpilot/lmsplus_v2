import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks -----------------------------------------------------------------

const { mockRouterRefresh } = vi.hoisted(() => ({
  mockRouterRefresh: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRouterRefresh }),
}))

const { mockDiscardQuiz } = vi.hoisted(() => ({
  mockDiscardQuiz: vi.fn(),
}))

vi.mock('../actions/discard', () => ({
  discardQuiz: (...args: unknown[]) => mockDiscardQuiz(...args),
}))

// ---- Subject under test ----------------------------------------------------

import { useActivePracticeDiscard } from './use-active-practice-discard'

// ---- Fixtures --------------------------------------------------------------

const SESSION_ID = 'sess-prac-001'
const USER_ID = 'user-prac-001'
const STORAGE_KEY = `quiz-active-session:${USER_ID}`

// Must satisfy isValidActiveSession: readActiveSession PURGES anything malformed, so a
// minimal { sessionId } stub would be dropped by the read itself and every assertion below
// would pass whether or not the discard cleared anything.
function storedSession(sessionId: string) {
  return JSON.stringify({
    userId: USER_ID,
    sessionId,
    questionIds: ['q-1', 'q-2'],
    answers: {},
    currentIndex: 0,
    savedAt: Date.now(),
    mode: 'study',
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  mockDiscardQuiz.mockResolvedValue({ success: true })
})

// ---- Tests -----------------------------------------------------------------

describe('useActivePracticeDiscard', () => {
  it('discards the session and refreshes in place on success', async () => {
    const { result } = renderHook(() => useActivePracticeDiscard(SESSION_ID, USER_ID))
    await act(async () => {
      await result.current.discard()
    })

    expect(mockDiscardQuiz).toHaveBeenCalledWith({ sessionId: SESSION_ID })
    expect(mockRouterRefresh).toHaveBeenCalledTimes(1)
    expect(result.current.discarded).toBe(true)
    expect(result.current.error).toBeNull()
  })

  it('surfaces the action error and does not refresh when discard fails', async () => {
    mockDiscardQuiz.mockResolvedValue({ success: false, error: 'Session not found' })
    const { result } = renderHook(() => useActivePracticeDiscard(SESSION_ID, USER_ID))
    await act(async () => {
      await result.current.discard()
    })

    expect(result.current.error).toBe('Session not found')
    expect(result.current.discarded).toBe(false)
    expect(mockRouterRefresh).not.toHaveBeenCalled()
  })

  it('surfaces a generic error when the discard request throws', async () => {
    mockDiscardQuiz.mockRejectedValue(new Error('network failure'))
    const { result } = renderHook(() => useActivePracticeDiscard(SESSION_ID, USER_ID))
    await act(async () => {
      await result.current.discard()
    })

    expect(result.current.error).toMatch(/server unavailable/i)
    expect(mockRouterRefresh).not.toHaveBeenCalled()
  })

  it('submits a single discard when invoked twice before the first settles', async () => {
    let resolveDiscard!: (v: { success: true }) => void
    mockDiscardQuiz.mockReturnValue(
      new Promise<{ success: true }>((res) => {
        resolveDiscard = res
      }),
    )

    const { result } = renderHook(() => useActivePracticeDiscard(SESSION_ID, USER_ID))
    await act(async () => {
      // Two synchronous invocations before the first promise settles — the
      // synchronous useRef guard rejects the second.
      void result.current.discard()
      void result.current.discard()
    })

    expect(mockDiscardQuiz).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveDiscard({ success: true })
    })
  })

  it('prevents resuming a session after it is discarded', async () => {
    localStorage.setItem(STORAGE_KEY, storedSession(SESSION_ID))
    const { result } = renderHook(() => useActivePracticeDiscard(SESSION_ID, USER_ID))
    await act(async () => {
      await result.current.discard()
    })

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  // Pins the disposition, not just the outcome: if the clear were moved onto the success
  // branch this fails, while the success-path test above would still pass.
  it('honours the discard even when the request fails', async () => {
    mockDiscardQuiz.mockResolvedValue({ success: false, error: 'Session not found' })
    localStorage.setItem(STORAGE_KEY, storedSession(SESSION_ID))
    const { result } = renderHook(() => useActivePracticeDiscard(SESSION_ID, USER_ID))
    await act(async () => {
      await result.current.discard()
    })

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(result.current.error).toBe('Session not found')
  })

  // Sibling of the test above, pinning the other half of "regardless of outcome": the clear
  // must precede the Server Action, not merely be unconditional after it. Moved below
  // `await discardQuiz(...)` it still runs on both resolved outcomes — so the success and
  // resolved-failure tests stay green — but is skipped entirely on a throw. This is the only
  // test that fails on that move.
  it('honours the discard even when the request throws', async () => {
    mockDiscardQuiz.mockRejectedValue(new Error('network failure'))
    localStorage.setItem(STORAGE_KEY, storedSession(SESSION_ID))
    const { result } = renderHook(() => useActivePracticeDiscard(SESSION_ID, USER_ID))
    await act(async () => {
      await result.current.discard()
    })

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(result.current.error).toMatch(/server unavailable/i)
  })

  // The banner is server-rendered and never revalidated, so a stale tab can offer to discard
  // a session that localStorage has already moved past. Fails if the id guard is removed.
  it('preserves a newer session when a stale banner discards an older one', async () => {
    localStorage.setItem(STORAGE_KEY, storedSession('sess-prac-999'))
    const { result } = renderHook(() => useActivePracticeDiscard(SESSION_ID, USER_ID))
    await act(async () => {
      await result.current.discard()
    })

    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull()
  })

  it('clears the error when clearError is called', async () => {
    mockDiscardQuiz.mockResolvedValue({ success: false, error: 'Session not found' })
    const { result } = renderHook(() => useActivePracticeDiscard(SESSION_ID, USER_ID))
    await act(async () => {
      await result.current.discard()
    })
    expect(result.current.error).toBe('Session not found')

    act(() => {
      result.current.clearError()
    })
    await waitFor(() => expect(result.current.error).toBeNull())
  })
})
