import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActionResult } from '@/lib/action-result'

const { mockDiscardQuiz, mockSessionStorageSetItem } = vi.hoisted(() => ({
  mockDiscardQuiz: vi.fn<() => Promise<ActionResult>>(),
  mockSessionStorageSetItem: vi.fn<(key: string, value: string) => void>(),
}))

vi.mock('../actions/discard', () => ({ discardQuiz: mockDiscardQuiz }))
vi.mock('../session/_utils/quiz-session-handoff', () => ({
  sessionHandoffKey: (userId: string) => `quiz-session:${userId}`,
}))

import type { ActiveExamSession } from '../actions/get-active-exam-session'
import {
  buildDiscardHandler,
  buildResumeHandler,
  type ResumeExamDeps,
} from './resume-exam-handlers'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Shared stubs
// ---------------------------------------------------------------------------

let setLoading: ReturnType<typeof vi.fn<(v: boolean) => void>>
let setError: ReturnType<typeof vi.fn<(v: string | null) => void>>
let setDiscarded: ReturnType<typeof vi.fn<(v: boolean) => void>>
// A fresh object per test stands in for the hook's useRef(false).
let discardingRef: { current: boolean }
let router: ResumeExamDeps['router']

function makeDeps(overrides: Partial<ResumeExamDeps> = {}): ResumeExamDeps {
  return {
    userId: 'user-1',
    exam: EXAM,
    activeSessionId: EXAM.sessionId,
    router,
    setLoading,
    setError,
    setDiscarded,
    discardingRef,
    ...overrides,
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  discardingRef = { current: false }
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: { setItem: mockSessionStorageSetItem, getItem: vi.fn(), removeItem: vi.fn() },
    writable: true,
    configurable: true,
  })
  setLoading = vi.fn()
  setError = vi.fn()
  setDiscarded = vi.fn()
  router = {
    push: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }
})

// ---------------------------------------------------------------------------
// buildResumeHandler
// ---------------------------------------------------------------------------

describe('buildResumeHandler', () => {
  it('writes the complete exam handoff under the user-scoped key and navigates to the session page', () => {
    const handle = buildResumeHandler(makeDeps({ userId: 'user-42' }))
    handle()

    expect(mockSessionStorageSetItem.mock.calls[0]?.[0]).toBe('quiz-session:user-42')
    const stored = JSON.parse(mockSessionStorageSetItem.mock.calls[0]?.[1] as string)
    expect(stored).toEqual({
      userId: 'user-42',
      sessionId: 'sess-exam-001',
      mode: 'exam',
      questionIds: ['q-1', 'q-2'],
      timeLimitSeconds: 3600,
      passMark: 75,
      subjectName: 'Air Law',
      subjectCode: 'ALW',
      startedAt: '2026-04-27T10:00:00.000Z',
    })
    expect(router.push).toHaveBeenCalledWith('/app/quiz/session')
  })

  it('does nothing when there is no exam to resume', () => {
    const handle = buildResumeHandler(makeDeps({ exam: undefined }))
    handle()

    expect(mockSessionStorageSetItem).not.toHaveBeenCalled()
    expect(router.push).not.toHaveBeenCalled()
  })

  it('sets an error and does not navigate when the handoff write fails', () => {
    mockSessionStorageSetItem.mockImplementationOnce(() => {
      throw new DOMException('QuotaExceededError')
    })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const handle = buildResumeHandler(makeDeps())
    handle()

    expect(setError).toHaveBeenCalledWith('Unable to resume right now. Please try again.')
    expect(router.push).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('does not set an error on a successful resume', () => {
    const handle = buildResumeHandler(makeDeps())
    handle()

    expect(setError).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// buildDiscardHandler
// ---------------------------------------------------------------------------

describe('buildDiscardHandler', () => {
  it('marks the session discarded and refreshes the page after a successful discard', async () => {
    mockDiscardQuiz.mockResolvedValue({ success: true })
    const handle = buildDiscardHandler(makeDeps())

    await handle()

    expect(mockDiscardQuiz).toHaveBeenCalledWith({ sessionId: 'sess-exam-001' })
    expect(setDiscarded).toHaveBeenCalledWith(true)
    expect(router.refresh).toHaveBeenCalledTimes(1)
    expect(setLoading).toHaveBeenLastCalledWith(false)
  })

  it('discards the session exactly once when triggered twice in the same tick', async () => {
    mockDiscardQuiz.mockResolvedValue({ success: true })
    const handle = buildDiscardHandler(makeDeps())

    // Two synchronous invocations with no flush between — only one discard may go out.
    const first = handle()
    const second = handle()
    await Promise.all([first, second])

    expect(mockDiscardQuiz).toHaveBeenCalledTimes(1)
  })

  it('shows the server error and allows a retry that succeeds on the second attempt', async () => {
    mockDiscardQuiz.mockResolvedValueOnce({ success: false, error: 'Session not found' })
    mockDiscardQuiz.mockResolvedValueOnce({ success: true })
    const handle = buildDiscardHandler(makeDeps())

    await handle()
    expect(setError).toHaveBeenCalledWith('Session not found')
    expect(setDiscarded).not.toHaveBeenCalled()
    expect(setLoading).toHaveBeenLastCalledWith(false)

    await handle()

    expect(mockDiscardQuiz).toHaveBeenCalledTimes(2)
    expect(setDiscarded).toHaveBeenCalledWith(true)
  })

  it('shows a generic message and stays retryable when the discard throws', async () => {
    mockDiscardQuiz.mockRejectedValueOnce(new Error('network failure'))
    mockDiscardQuiz.mockResolvedValueOnce({ success: true })
    const handle = buildDiscardHandler(makeDeps())

    await handle()
    expect(setError).toHaveBeenCalledWith('Server unavailable. Please try again later.')
    expect(setLoading).toHaveBeenLastCalledWith(false)

    await handle()

    expect(mockDiscardQuiz).toHaveBeenCalledTimes(2)
  })

  it('shows a generic message when the discard result has no error string', async () => {
    // success: false with no error field — the ?? fallback must kick in
    mockDiscardQuiz.mockResolvedValue({ success: false, error: undefined as unknown as string })
    const handle = buildDiscardHandler(makeDeps())

    await handle()

    expect(setError).toHaveBeenCalledWith('Failed to discard. Please try again.')
  })

  it('ignores further discard attempts after a successful discard', async () => {
    mockDiscardQuiz.mockResolvedValue({ success: true })
    const handle = buildDiscardHandler(makeDeps())

    await handle()
    await handle()

    // The banner is dismissed on success — a late duplicate must not re-fire.
    expect(mockDiscardQuiz).toHaveBeenCalledTimes(1)
  })

  it('clears the error state at the start of each attempt', async () => {
    mockDiscardQuiz.mockResolvedValue({ success: true })
    const handle = buildDiscardHandler(makeDeps())

    await handle()

    expect(setError).toHaveBeenNthCalledWith(1, null)
  })
})
