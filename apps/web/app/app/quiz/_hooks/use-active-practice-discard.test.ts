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

beforeEach(() => {
  vi.resetAllMocks()
  mockDiscardQuiz.mockResolvedValue({ success: true })
})

// ---- Tests -----------------------------------------------------------------

describe('useActivePracticeDiscard', () => {
  it('discards the session and refreshes in place on success', async () => {
    const { result } = renderHook(() => useActivePracticeDiscard(SESSION_ID))
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
    const { result } = renderHook(() => useActivePracticeDiscard(SESSION_ID))
    await act(async () => {
      await result.current.discard()
    })

    expect(result.current.error).toBe('Session not found')
    expect(result.current.discarded).toBe(false)
    expect(mockRouterRefresh).not.toHaveBeenCalled()
  })

  it('surfaces a generic error when the discard request throws', async () => {
    mockDiscardQuiz.mockRejectedValue(new Error('network failure'))
    const { result } = renderHook(() => useActivePracticeDiscard(SESSION_ID))
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

    const { result } = renderHook(() => useActivePracticeDiscard(SESSION_ID))
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

  it('clears the error when clearError is called', async () => {
    mockDiscardQuiz.mockResolvedValue({ success: false, error: 'Session not found' })
    const { result } = renderHook(() => useActivePracticeDiscard(SESSION_ID))
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
