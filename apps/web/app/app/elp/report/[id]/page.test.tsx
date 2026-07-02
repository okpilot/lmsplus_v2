import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OralExamReport } from '@/lib/queries/oral-exam-report'
import type { OralSessionDetail } from '@/lib/queries/oral-exam-session'

// ---- Mocks ------------------------------------------------------------------

const { mockRequireAuthUser, mockGetOralExamSession, mockGetOralExamReport, mockRedirect } =
  vi.hoisted(() => ({
    mockRequireAuthUser: vi.fn(),
    mockGetOralExamSession: vi.fn(),
    mockGetOralExamReport: vi.fn(),
    mockRedirect: vi.fn((url: string) => {
      throw new Error(`REDIRECT:${url}`)
    }),
  }))

vi.mock('@/lib/auth/require-auth-user', () => ({
  requireAuthUser: mockRequireAuthUser,
}))

vi.mock('@/lib/queries/oral-exam-session', () => ({
  getOralExamSession: mockGetOralExamSession,
}))

vi.mock('@/lib/queries/oral-exam-report', () => ({
  getOralExamReport: mockGetOralExamReport,
}))

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
}))

// OralReportCard and OralExamPending have their own test files — stub them so
// the page test only exercises the page's own branching logic.
vi.mock('../_components/oral-report-card', () => ({
  OralReportCard: ({ report }: { report: OralExamReport }) => (
    <div data-testid="oral-report-card" data-session-id={report.sessionId} />
  ),
}))

vi.mock('../_components/oral-exam-pending', () => ({
  OralExamPending: ({ state, sessionId }: { state: string; sessionId: string }) => (
    <div data-testid="oral-exam-pending" data-state={state} data-session-id={sessionId} />
  ),
}))

// ---- Subject under test ------------------------------------------------------

import OralExamReportPage from './page'

// ---- Fixtures ----------------------------------------------------------------

const SESSION_ID = '22222222-2222-2222-2222-222222222222'

function gradedSession(overrides: Partial<OralSessionDetail> = {}): OralSessionDetail {
  return {
    id: SESSION_ID,
    status: 'graded',
    mode: 'practice',
    sections: [{ sectionNo: 1, type: 'interview' }],
    responses: [{ sectionNo: 1, status: 'graded' }],
    ...overrides,
  }
}

function pendingSession(overrides: Partial<OralSessionDetail> = {}): OralSessionDetail {
  return {
    id: SESSION_ID,
    status: 'in_progress',
    mode: 'practice',
    sections: [{ sectionNo: 1, type: 'interview' }],
    responses: [],
    ...overrides,
  }
}

const REPORT_FIXTURE: OralExamReport = {
  sessionId: SESSION_ID,
  status: 'graded',
  totalFinalLevel: 4,
  startedAt: '2026-07-01T10:00:00+00:00',
  endedAt: '2026-07-01T10:15:00+00:00',
  descriptors: [],
  sections: [],
}

function callPage() {
  return OralExamReportPage({ params: Promise.resolve({ id: SESSION_ID }) })
}

// ---- Setup ------------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks()
  mockRequireAuthUser.mockResolvedValue({ id: 'u1', email: 'ada@example.com' })
  // resetAllMocks strips the hoisted throwing implementation — restore it so
  // every test observes redirect() as terminal, matching real Next.js behavior.
  mockRedirect.mockImplementation((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  })
})

// ---- Tests ------------------------------------------------------------------

describe('OralExamReportPage — session not found', () => {
  it('redirects to the ELP home page when the session does not exist', async () => {
    mockGetOralExamSession.mockResolvedValue(null)

    await expect(callPage()).rejects.toThrow('REDIRECT:/app/elp')
    expect(mockRedirect).toHaveBeenCalledWith('/app/elp')
  })
})

describe('OralExamReportPage — graded session', () => {
  it('renders the report card and does not redirect when the report is ready', async () => {
    mockGetOralExamSession.mockResolvedValue(gradedSession())
    mockGetOralExamReport.mockResolvedValue(REPORT_FIXTURE)

    const jsx = await callPage()
    render(jsx)

    expect(mockRedirect).not.toHaveBeenCalled()
    const card = screen.getByTestId('oral-report-card')
    expect(card).toBeInTheDocument()
    expect(card.dataset.sessionId).toBe(SESSION_ID)
  })

  it('redirects to the ELP home page when the graded session has no report yet', async () => {
    // This guards the case where status='graded' but get_oral_exam_report returns
    // null (e.g. race between the grader writing the report and the page loading).
    mockGetOralExamSession.mockResolvedValue(gradedSession())
    mockGetOralExamReport.mockResolvedValue(null)

    await expect(callPage()).rejects.toThrow('REDIRECT:/app/elp')
    expect(mockRedirect).toHaveBeenCalledWith('/app/elp')
  })
})

describe('OralExamReportPage — pending session', () => {
  it('redirects to the session runner when the session has no submitted responses', async () => {
    mockGetOralExamSession.mockResolvedValue(pendingSession())

    await expect(callPage()).rejects.toThrow(`REDIRECT:/app/elp/session/${SESSION_ID}`)
    expect(mockRedirect).toHaveBeenCalledWith(`/app/elp/session/${SESSION_ID}`)
  })

  it('shows the grading-in-progress state when no section has failed', async () => {
    mockGetOralExamSession.mockResolvedValue(
      pendingSession({ responses: [{ sectionNo: 1, status: 'grading' }] }),
    )

    const jsx = await callPage()
    render(jsx)

    expect(mockRedirect).not.toHaveBeenCalled()
    const pending = screen.getByTestId('oral-exam-pending')
    expect(pending.dataset.state).toBe('grading')
    expect(pending.dataset.sessionId).toBe(SESSION_ID)
  })

  it('shows the failed state when at least one section response has failed', async () => {
    mockGetOralExamSession.mockResolvedValue(
      pendingSession({ responses: [{ sectionNo: 1, status: 'failed' }] }),
    )

    const jsx = await callPage()
    render(jsx)

    expect(mockRedirect).not.toHaveBeenCalled()
    const pending = screen.getByTestId('oral-exam-pending')
    expect(pending.dataset.state).toBe('failed')
    expect(pending.dataset.sessionId).toBe(SESSION_ID)
  })
})
