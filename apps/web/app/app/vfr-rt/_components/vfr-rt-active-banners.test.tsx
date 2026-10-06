import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetActiveExamSession, mockGetActivePracticeSession } = vi.hoisted(() => ({
  mockGetActiveExamSession: vi.fn(),
  mockGetActivePracticeSession: vi.fn(),
}))

vi.mock('@/app/app/quiz/actions/get-active-exam-session', () => ({
  getActiveExamSession: (...args: unknown[]) => mockGetActiveExamSession(...args),
}))
vi.mock('@/app/app/quiz/actions/get-active-practice-session', () => ({
  getActivePracticeSession: (...args: unknown[]) => mockGetActivePracticeSession(...args),
}))
vi.mock('@/app/app/quiz/_components/active-practice-banner', () => ({
  ActivePracticeBanner: ({ session }: { session: { sessionId: string } }) => (
    <div data-testid="practice-banner">{session.sessionId}</div>
  ),
}))
vi.mock('@/app/app/quiz/_components/resume-exam-banner', () => ({
  ResumeExamBanner: ({ exam, sessionId }: { exam?: { sessionId: string }; sessionId?: string }) => (
    <div data-testid="exam-banner">{exam?.sessionId ?? sessionId}</div>
  ),
}))

vi.mock('@/app/app/quiz/_components/expired-exam-notice', () => ({
  ExpiredExamNotice: ({ sessionId }: { sessionId: string }) => (
    <div data-testid="expired-notice">{sessionId}</div>
  ),
}))

import { VfrRtActiveBanners } from './vfr-rt-active-banners'

beforeEach(() => {
  vi.resetAllMocks()
  mockGetActiveExamSession.mockResolvedValue({
    success: true,
    sessions: [],
    orphanedSessionIds: [],
    expiredSessionIds: [],
  })
  mockGetActivePracticeSession.mockResolvedValue({ success: true, session: null })
})

async function renderBanners() {
  render(await VfrRtActiveBanners({ userId: 'user-1' }))
}

describe('VfrRtActiveBanners', () => {
  it('renders nothing when no session is open', async () => {
    await renderBanners()
    expect(screen.queryByTestId('practice-banner')).not.toBeInTheDocument()
    expect(screen.queryByTestId('exam-banner')).not.toBeInTheDocument()
  })

  it('shows the open practice session so the student can resume or discard it', async () => {
    mockGetActivePracticeSession.mockResolvedValue({
      success: true,
      session: { sessionId: 'prac-1' },
    })
    await renderBanners()
    expect(screen.getByTestId('practice-banner')).toHaveTextContent('prac-1')
  })

  it('shows an open practice exam and a stuck exam that can only be discarded', async () => {
    mockGetActiveExamSession.mockResolvedValue({
      success: true,
      sessions: [{ sessionId: 'exam-1' }],
      orphanedSessionIds: ['orphan-1'],
      expiredSessionIds: [],
    })
    await renderBanners()
    expect(screen.getAllByTestId('exam-banner').map((e) => e.textContent)).toEqual([
      'exam-1',
      'orphan-1',
    ])
  })

  it('tells the student a Practice Exam ran out of time and was submitted', async () => {
    mockGetActiveExamSession.mockResolvedValue({
      success: true,
      sessions: [],
      orphanedSessionIds: [],
      expiredSessionIds: ['expired-1'],
    })
    await renderBanners()
    expect(screen.getByTestId('expired-notice')).toHaveTextContent('expired-1')
  })

  it('tells the student when a lookup fails instead of hiding the banner silently', async () => {
    mockGetActiveExamSession.mockResolvedValue({ success: false, error: 'boom' })
    mockGetActivePracticeSession.mockResolvedValue({ success: false, error: 'boom' })
    await renderBanners()
    expect(screen.getAllByRole('alert')).toHaveLength(2)
    expect(screen.queryByTestId('practice-banner')).not.toBeInTheDocument()
  })
})
