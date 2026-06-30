import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InternalExamContent } from './internal-exam-content'

// ---- Mocks ----------------------------------------------------------------

const { mockListAvailableInternalExams, mockListMyInternalExamHistory, mockGetActiveSession } =
  vi.hoisted(() => ({
    mockListAvailableInternalExams: vi.fn(),
    mockListMyInternalExamHistory: vi.fn(),
    mockGetActiveSession: vi.fn(),
  }))

vi.mock('../queries', () => ({
  listAvailableInternalExams: (...args: unknown[]) => mockListAvailableInternalExams(...args),
  listMyInternalExamHistory: (...args: unknown[]) => mockListMyInternalExamHistory(...args),
}))

vi.mock('../actions/get-active-internal-exam-session', () => ({
  getActiveInternalExamSession: (...args: unknown[]) => mockGetActiveSession(...args),
}))

// Stub child components so their own imports don't load
vi.mock('./internal-exam-tabs', () => ({
  InternalExamTabs: () => <div data-testid="internal-exam-tabs" />,
}))

vi.mock('./recovery-banner', () => ({
  RecoveryBanner: () => <div data-testid="recovery-banner" />,
}))

// ---- Lifecycle ------------------------------------------------------------

afterEach(() => {
  vi.useRealTimers()
})

beforeEach(() => {
  vi.resetAllMocks()
  // Default: all queries succeed with empty data
  mockListAvailableInternalExams.mockResolvedValue({ success: true, data: [] })
  mockListMyInternalExamHistory.mockResolvedValue({ success: true, data: [] })
  mockGetActiveSession.mockResolvedValue({
    success: true,
    sessions: [],
    orphanedSessionIds: [],
    expiredSessionIds: [],
  })
})

// ---- Tests ----------------------------------------------------------------

describe('InternalExamContent', () => {
  it('shows the error banner when available exams fail to load', async () => {
    mockListAvailableInternalExams.mockResolvedValue({ success: false, data: [] })

    const jsx = await InternalExamContent({ userId: 'u1' })
    render(jsx)

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent("couldn't load your internal exams")
  })

  it('shows the error banner when exam history fails to load', async () => {
    mockListMyInternalExamHistory.mockResolvedValue({ success: false, data: [] })

    const jsx = await InternalExamContent({ userId: 'u1' })
    render(jsx)

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent("couldn't load your internal exams")
  })

  it('shows the error banner when the active-session fetch fails', async () => {
    // A failed active-session fetch must not degrade silently — without this,
    // a mid-exam recovery failure would leave the student no signal at all.
    mockGetActiveSession.mockResolvedValue({ success: false, error: 'rpc failed' })

    const jsx = await InternalExamContent({ userId: 'u1' })
    render(jsx)

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent("couldn't load your internal exams")
  })

  it('does not show the error banner when all data loads successfully', async () => {
    const jsx = await InternalExamContent({ userId: 'u1' })
    render(jsx)

    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('still renders the tabs when all data loads successfully but is empty', async () => {
    // A genuinely-empty result must not suppress the tabs — the tabs render an
    // "enrol" prompt for the student when there are no exams.
    const jsx = await InternalExamContent({ userId: 'u1' })
    render(jsx)

    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByTestId('internal-exam-tabs')).toBeInTheDocument()
  })

  it('still renders the tabs alongside the banner when a load fails', async () => {
    // Current behaviour: the banner signals the failure but the tabs still mount,
    // so a partially-loaded list is not dropped. Tab-scoped error states are a
    // separate UX refinement tracked in #720.
    mockListAvailableInternalExams.mockResolvedValue({ success: false, data: [] })

    const jsx = await InternalExamContent({ userId: 'u1' })
    render(jsx)

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByTestId('internal-exam-tabs')).toBeInTheDocument()
  })

  it('renders a recovery banner for each active session', async () => {
    mockGetActiveSession.mockResolvedValue({
      success: true,
      sessions: [{ sessionId: 's1' }],
      orphanedSessionIds: [],
      expiredSessionIds: [],
    })

    const jsx = await InternalExamContent({ userId: 'u1' })
    render(jsx)

    expect(screen.getByTestId('recovery-banner')).toBeInTheDocument()
  })

  it('surfaces the error banner when a query hangs past the load timeout', async () => {
    vi.useFakeTimers()
    // One query hangs forever — withTimeout converts it to { success: false }
    // after the timeout, which flips loadFailed and renders the existing banner.
    mockListAvailableInternalExams.mockReturnValue(new Promise(() => {}))

    const componentPromise = InternalExamContent({ userId: 'u1' })
    // 10_000 ms timeout + 1 ms to ensure it has fired
    await vi.advanceTimersByTimeAsync(10001)
    const jsx = await componentPromise
    render(jsx)

    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})
