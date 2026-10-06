import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActionResult } from '@/lib/action-result'

const { mockDiscardQuiz } = vi.hoisted(() => ({
  mockDiscardQuiz: vi.fn<() => Promise<ActionResult>>(),
}))

vi.mock('../actions/discard', () => ({ discardQuiz: mockDiscardQuiz }))

import { createMockRouter } from '@/lib/test-support/mock-router'
import { buildDiscardHandler, type ResumeExamDeps } from './resume-exam-handlers'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'quiz-active-session:user-1'

// readActiveSession PURGES anything malformed, so a minimal { sessionId }
// stub would be dropped by the read and the assertions would pass vacuously.
function storedSession(sessionId: string) {
  return JSON.stringify({
    userId: 'user-1',
    sessionId,
    questionIds: ['q-1', 'q-2'],
    answers: {},
    currentIndex: 0,
    savedAt: Date.now(),
    mode: 'exam',
    startedAt: '2026-04-27T10:00:00.000Z',
    timeLimitSeconds: 3600,
  })
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
    activeSessionId: 'sess-exam-001',
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
  localStorage.clear()
  setLoading = vi.fn()
  setError = vi.fn()
  setDiscarded = vi.fn()
  router = createMockRouter()
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

  it('prevents resuming an exam after it is discarded', async () => {
    localStorage.setItem(STORAGE_KEY, storedSession('sess-exam-001'))
    mockDiscardQuiz.mockResolvedValue({ success: true })

    await buildDiscardHandler(makeDeps())()

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  // Pins the disposition, not just the outcome: moving the clear onto the success branch
  // fails this test while leaving the success-path test above green.
  it('honours the discard even when the request fails', async () => {
    localStorage.setItem(STORAGE_KEY, storedSession('sess-exam-001'))
    mockDiscardQuiz.mockResolvedValue({ success: false, error: 'Session not found' })

    await buildDiscardHandler(makeDeps())()

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(setError).toHaveBeenCalledWith('Session not found')
  })

  // Sibling of the test above, pinning the other half of "regardless of outcome": the clear
  // must precede the Server Action, not merely be unconditional after it. Moved below
  // `await discardQuiz(...)` it still runs on both resolved outcomes — so the success and
  // resolved-failure tests stay green — but is skipped entirely on a throw. This is the only
  // test that fails on that move.
  it('honours the discard even when the request throws', async () => {
    localStorage.setItem(STORAGE_KEY, storedSession('sess-exam-001'))
    mockDiscardQuiz.mockRejectedValue(new Error('network failure'))

    await buildDiscardHandler(makeDeps())()

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(setError).toHaveBeenCalledWith('Server unavailable. Please try again later.')
  })

  // The banner is server-rendered and never revalidated, so a stale tab can offer to discard
  // an exam localStorage has already moved past — wiping a newer graded attempt's answers.
  // Fails if the id guard is removed.
  it('preserves a newer exam when a stale banner discards an older one', async () => {
    localStorage.setItem(STORAGE_KEY, storedSession('sess-exam-999'))
    mockDiscardQuiz.mockResolvedValue({ success: true })

    await buildDiscardHandler(makeDeps())()

    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull()
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

  it('shows the fallback message when discard fails without details', async () => {
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
