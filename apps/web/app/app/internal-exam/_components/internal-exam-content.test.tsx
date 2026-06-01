import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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
  it('shows the error banner when listAvailableInternalExams fails', async () => {
    mockListAvailableInternalExams.mockResolvedValue({ success: false, data: [] })

    const jsx = await InternalExamContent({ userId: 'u1' })
    render(jsx)

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent("couldn't load your internal exams")
  })

  it('shows the error banner when listMyInternalExamHistory fails', async () => {
    mockListMyInternalExamHistory.mockResolvedValue({ success: false, data: [] })

    const jsx = await InternalExamContent({ userId: 'u1' })
    render(jsx)

    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('does not show the error banner when both queries succeed', async () => {
    // Both mocks already return success:true from beforeEach defaults

    const jsx = await InternalExamContent({ userId: 'u1' })
    render(jsx)

    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('still renders the tabs when both queries succeed with empty data', async () => {
    // success:true, data:[] — genuinely empty result must not suppress the tabs
    // (the tabs render an "enrol" prompt for the student when there are no exams)

    const jsx = await InternalExamContent({ userId: 'u1' })
    render(jsx)

    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByTestId('internal-exam-tabs')).toBeInTheDocument()
  })
})
