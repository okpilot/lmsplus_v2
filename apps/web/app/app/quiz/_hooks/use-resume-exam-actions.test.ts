import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockRouterRefresh, mockDiscardQuiz } = vi.hoisted(() => ({
  mockRouterRefresh: vi.fn(),
  mockDiscardQuiz: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRouterRefresh }),
}))

vi.mock('../actions/discard', () => ({
  discardQuiz: (...args: unknown[]) => mockDiscardQuiz(...args),
}))

// ---- Subject under test ---------------------------------------------------

import { useResumeExamActions } from './use-resume-exam-actions'

// ---- Fixtures -------------------------------------------------------------

const SESSION_ID = 'sess-exam-001'
const USER_ID = 'user-test'

function renderActions(opts?: Partial<Parameters<typeof useResumeExamActions>[0]>) {
  return renderHook(() =>
    useResumeExamActions({
      userId: USER_ID,
      activeSessionId: SESSION_ID,
      ...opts,
    }),
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  mockDiscardQuiz.mockResolvedValue({ success: true })
})

// ---- Discard --------------------------------------------------------------

describe('useResumeExamActions — discard', () => {
  it('marks the session discarded and refreshes the page after a successful discard', async () => {
    const { result } = renderActions()

    await act(async () => {
      await result.current.handleDiscard()
    })

    expect(mockDiscardQuiz).toHaveBeenCalledWith({ sessionId: SESSION_ID })
    expect(result.current.discarded).toBe(true)
    expect(mockRouterRefresh).toHaveBeenCalledTimes(1)
  })

  it('discards the session exactly once when triggered twice in the same tick', async () => {
    const { result } = renderActions()

    await act(async () => {
      void result.current.handleDiscard()
      void result.current.handleDiscard()
    })

    expect(mockDiscardQuiz).toHaveBeenCalledTimes(1)
  })

  it('shows the server error and stays retryable when the discard fails', async () => {
    mockDiscardQuiz.mockResolvedValue({ success: false, error: 'Session not found' })
    const { result } = renderActions()

    await act(async () => {
      await result.current.handleDiscard()
    })

    expect(result.current.error).toBe('Session not found')
    expect(result.current.discarded).toBe(false)
    expect(result.current.loading).toBe(false)

    // "Retryable" is the claim in the title, so prove it: the failed attempt must have
    // released the one-shot guard. Without this, a regression that leaves the ref
    // locked still passes every assertion above while the user is locked out.
    mockDiscardQuiz.mockResolvedValue({ success: true })
    await act(async () => {
      await result.current.handleDiscard()
    })
    expect(mockDiscardQuiz).toHaveBeenCalledTimes(2)
    expect(result.current.discarded).toBe(true)
  })

  it('discards a stuck session by id', async () => {
    const { result } = renderActions({ activeSessionId: 'sess-orphan' })

    await act(async () => {
      await result.current.handleDiscard()
    })

    expect(mockDiscardQuiz).toHaveBeenCalledWith({ sessionId: 'sess-orphan' })
    expect(result.current.discarded).toBe(true)
  })

  it('shows a generic error when the discard throws', async () => {
    mockDiscardQuiz.mockRejectedValue(new Error('network failure'))
    const { result } = renderActions()

    await act(async () => {
      await result.current.handleDiscard()
    })

    expect(result.current.error).toMatch(/server unavailable/i)
    expect(result.current.discarded).toBe(false)
  })
})
