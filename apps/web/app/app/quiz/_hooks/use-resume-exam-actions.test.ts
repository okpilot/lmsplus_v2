import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockRouterPush, mockRouterRefresh, mockDiscardQuiz } = vi.hoisted(() => ({
  mockRouterPush: vi.fn(),
  mockRouterRefresh: vi.fn(),
  mockDiscardQuiz: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush, refresh: mockRouterRefresh }),
}))

vi.mock('../actions/discard', () => ({
  discardQuiz: (...args: unknown[]) => mockDiscardQuiz(...args),
}))

vi.mock('../session/_utils/quiz-session-handoff', () => ({
  sessionHandoffKey: (userId: string) => `quiz-session:${userId}`,
}))

// ---- Subject under test ---------------------------------------------------

import type { ActiveExamSession } from '../actions/get-active-exam-session'
import { useResumeExamActions } from './use-resume-exam-actions'

// ---- Fixtures -------------------------------------------------------------

const EXAM: ActiveExamSession = {
  sessionId: 'sess-exam-001',
  subjectId: 'subj-aaa',
  subjectName: 'Air Law',
  subjectCode: 'ALW',
  startedAt: '2026-04-27T10:00:00.000Z',
  timeLimitSeconds: 3600,
  passMark: 75,
  questionIds: ['q-1', 'q-2'],
}

const USER_ID = 'user-test'

function renderActions(opts?: Partial<Parameters<typeof useResumeExamActions>[0]>) {
  return renderHook(() =>
    useResumeExamActions({
      userId: USER_ID,
      exam: EXAM,
      activeSessionId: EXAM.sessionId,
      ...opts,
    }),
  )
}

// ---- Session storage helpers ---------------------------------------------

const originalSessionStorage = globalThis.sessionStorage
let mockSetItem: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.resetAllMocks()
  mockDiscardQuiz.mockResolvedValue({ success: true })
  mockSetItem = vi.fn()
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: { setItem: mockSetItem, getItem: vi.fn(), removeItem: vi.fn() },
    writable: true,
    configurable: true,
  })
})

afterEach(() => {
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: originalSessionStorage,
    writable: true,
    configurable: true,
  })
})

// ---- Resume ---------------------------------------------------------------

describe('useResumeExamActions — resume', () => {
  it('writes the complete exam handoff to sessionStorage and navigates to the session page', () => {
    const { result } = renderActions()

    act(() => result.current.handleResume())

    expect(mockSetItem).toHaveBeenCalledWith(
      `quiz-session:${USER_ID}`,
      expect.stringContaining('sess-exam-001'),
    )
    const stored = JSON.parse(mockSetItem.mock.calls[0]?.[1] as string)
    expect(stored).toEqual({
      userId: USER_ID,
      sessionId: 'sess-exam-001',
      mode: 'exam',
      questionIds: ['q-1', 'q-2'],
      timeLimitSeconds: 3600,
      passMark: 75,
      subjectName: 'Air Law',
      subjectCode: 'ALW',
      startedAt: '2026-04-27T10:00:00.000Z',
    })
    expect(mockRouterPush).toHaveBeenCalledWith('/app/quiz/session')
  })

  it('shows an error and does not navigate when the handoff write fails', () => {
    mockSetItem.mockImplementation(() => {
      throw new DOMException('QuotaExceededError')
    })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { result } = renderActions()

    act(() => result.current.handleResume())

    expect(result.current.error).toMatch(/unable to resume/i)
    expect(mockRouterPush).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('does nothing when there is no exam to resume', () => {
    const { result } = renderActions({ exam: undefined })

    act(() => result.current.handleResume())

    expect(mockSetItem).not.toHaveBeenCalled()
    expect(mockRouterPush).not.toHaveBeenCalled()
  })
})

// ---- Discard --------------------------------------------------------------

describe('useResumeExamActions — discard', () => {
  it('marks the session discarded and refreshes the page after a successful discard', async () => {
    const { result } = renderActions()

    await act(async () => {
      await result.current.handleDiscard()
    })

    expect(mockDiscardQuiz).toHaveBeenCalledWith({ sessionId: 'sess-exam-001' })
    expect(result.current.discarded).toBe(true)
    expect(mockRouterRefresh).toHaveBeenCalledTimes(1)
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

  it('discards the session exactly once when triggered twice in the same tick', async () => {
    const { result } = renderActions()

    await act(async () => {
      // Two synchronous invocations with no flush between — e.g. a double-fired
      // dialog action. Only one server call may go out.
      void result.current.handleDiscard()
      void result.current.handleDiscard()
    })

    expect(mockDiscardQuiz).toHaveBeenCalledTimes(1)
  })

  it('allows a retry after a failed discard and succeeds on the second attempt', async () => {
    mockDiscardQuiz.mockResolvedValueOnce({ success: false, error: 'Session not found' })
    mockDiscardQuiz.mockResolvedValueOnce({ success: true })
    const { result } = renderActions()

    await act(async () => {
      await result.current.handleDiscard()
    })
    expect(result.current.error).toBe('Session not found')

    await act(async () => {
      await result.current.handleDiscard()
    })

    expect(mockDiscardQuiz).toHaveBeenCalledTimes(2)
    expect(result.current.discarded).toBe(true)
  })

  it('ignores further discard attempts after a successful discard', async () => {
    const { result } = renderActions()

    await act(async () => {
      await result.current.handleDiscard()
    })
    await act(async () => {
      await result.current.handleDiscard()
    })

    expect(mockDiscardQuiz).toHaveBeenCalledTimes(1)
  })
})
