import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OralSessionDetail } from '@/lib/queries/oral-exam-session'

const { mockRequireAuthUser, mockGetOralExamSession, mockRedirect } = vi.hoisted(() => ({
  mockRequireAuthUser: vi.fn(),
  mockGetOralExamSession: vi.fn(),
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

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
}))

// OralSectionRunner has its own test file — here we only verify the page reads
// the server-side session state and forwards the right props (or redirects).
vi.mock('./_components/oral-section-runner', () => ({
  OralSectionRunner: ({
    session,
    section,
    prompt,
  }: {
    session: OralSessionDetail
    section: { sectionNo: number; isLast: boolean }
    prompt: { id: string }
  }) => (
    <div
      data-testid="oral-section-runner"
      data-session-id={session.id}
      data-section-no={section.sectionNo}
      data-prompt-id={prompt.id}
      data-is-last={String(section.isLast)}
    />
  ),
}))

import OralExamSessionPage from './page'

const SESSION_ID = '11111111-1111-1111-1111-111111111111'

function callPage() {
  return OralExamSessionPage({ params: Promise.resolve({ id: SESSION_ID }) })
}

beforeEach(() => {
  vi.resetAllMocks()
  mockRequireAuthUser.mockResolvedValue({ id: 'u1', email: 'ada@example.com' })
  // resetAllMocks strips the hoisted throwing implementation — restore it so
  // every test observes redirect() as terminal, matching real Next.js behavior.
  mockRedirect.mockImplementation((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  })
})

describe('OralExamSessionPage', () => {
  it('redirects to the ELP home page when the session does not exist', async () => {
    mockGetOralExamSession.mockResolvedValue(null)

    await expect(callPage()).rejects.toThrow('REDIRECT:/app/elp')
    expect(mockRedirect).toHaveBeenCalledWith('/app/elp')
  })

  it('redirects to the report page when the session has already been graded', async () => {
    const gradedSession: OralSessionDetail = {
      id: SESSION_ID,
      status: 'graded',
      mode: 'practice',
      sections: [{ sectionNo: 1, type: 'interview' }],
      responses: [{ sectionNo: 1, status: 'graded' }],
    }
    mockGetOralExamSession.mockResolvedValue(gradedSession)

    await expect(callPage()).rejects.toThrow(`REDIRECT:/app/elp/report/${SESSION_ID}`)
    expect(mockRedirect).toHaveBeenCalledWith(`/app/elp/report/${SESSION_ID}`)
  })

  it('redirects to the report page when the session is still being scored', async () => {
    const gradingSession: OralSessionDetail = {
      id: SESSION_ID,
      status: 'grading',
      mode: 'practice',
      sections: [{ sectionNo: 1, type: 'interview' }],
      responses: [{ sectionNo: 1, status: 'grading' }],
    }
    mockGetOralExamSession.mockResolvedValue(gradingSession)

    await expect(callPage()).rejects.toThrow(`REDIRECT:/app/elp/report/${SESSION_ID}`)
    expect(mockRedirect).toHaveBeenCalledWith(`/app/elp/report/${SESSION_ID}`)
  })

  it('redirects to the report page (not a fresh recorder) when a section failed scoring', async () => {
    const failedSession: OralSessionDetail = {
      id: SESSION_ID,
      status: 'grading',
      mode: 'practice',
      sections: [{ sectionNo: 1, type: 'interview' }],
      responses: [{ sectionNo: 1, status: 'failed' }],
    }
    mockGetOralExamSession.mockResolvedValue(failedSession)

    await expect(callPage()).rejects.toThrow(`REDIRECT:/app/elp/report/${SESSION_ID}`)
    expect(mockRedirect).toHaveBeenCalledWith(`/app/elp/report/${SESSION_ID}`)
  })

  it('renders the practice runner and does not redirect for an in-progress session', async () => {
    const inProgressSession: OralSessionDetail = {
      id: SESSION_ID,
      status: 'in_progress',
      mode: 'practice',
      sections: [{ sectionNo: 1, type: 'interview' }],
      responses: [],
    }
    mockGetOralExamSession.mockResolvedValue(inProgressSession)

    const jsx = await callPage()
    render(jsx)

    expect(mockRedirect).not.toHaveBeenCalled()
    const runner = screen.getByTestId('oral-section-runner')
    expect(runner.dataset.sessionId).toBe(SESSION_ID)
    expect(runner.dataset.sectionNo).toBe('1')
    expect(runner.dataset.promptId).toBe('interview-1')
  })

  it('advances a mock exam to the next unsubmitted section after the first is answered', async () => {
    const mockSession: OralSessionDetail = {
      id: SESSION_ID,
      status: 'in_progress',
      mode: 'mock',
      sections: [
        { sectionNo: 1, type: 'interview' },
        { sectionNo: 2, type: 'picture' },
        { sectionNo: 3, type: 'comms' },
        { sectionNo: 4, type: 'listening' },
        { sectionNo: 5, type: 'video' },
      ],
      responses: [{ sectionNo: 1, status: 'grading' }],
    }
    mockGetOralExamSession.mockResolvedValue(mockSession)

    const jsx = await callPage()
    render(jsx)

    expect(mockRedirect).not.toHaveBeenCalled()
    const runner = screen.getByTestId('oral-section-runner')
    expect(runner.dataset.sectionNo).toBe('2')
    expect(runner.dataset.promptId).toBe('picture-1')
  })

  it('renders the final section of a 5-section mock as the last one when sections 1–4 are already submitted', async () => {
    const finalSectionSession: OralSessionDetail = {
      id: SESSION_ID,
      status: 'in_progress',
      mode: 'mock',
      sections: [
        { sectionNo: 1, type: 'interview' },
        { sectionNo: 2, type: 'picture' },
        { sectionNo: 3, type: 'comms' },
        { sectionNo: 4, type: 'listening' },
        { sectionNo: 5, type: 'video' },
      ],
      responses: [
        { sectionNo: 1, status: 'grading' },
        { sectionNo: 2, status: 'grading' },
        { sectionNo: 3, status: 'grading' },
        { sectionNo: 4, status: 'grading' },
      ],
    }
    mockGetOralExamSession.mockResolvedValue(finalSectionSession)

    const jsx = await callPage()
    render(jsx)

    expect(mockRedirect).not.toHaveBeenCalled()
    const runner = screen.getByTestId('oral-section-runner')
    expect(runner.dataset.sectionNo).toBe('5')
    expect(runner.dataset.promptId).toBe('video-1')
    // isLast=true means useSectionSubmit will push to the report page, not refresh
    expect(runner.dataset.isLast).toBe('true')
  })

  it('redirects to the report page when every section is submitted but the session is still in progress', async () => {
    const allSubmitted: OralSessionDetail = {
      id: SESSION_ID,
      status: 'in_progress',
      mode: 'mock',
      sections: [
        { sectionNo: 1, type: 'interview' },
        { sectionNo: 2, type: 'picture' },
      ],
      responses: [
        { sectionNo: 1, status: 'grading' },
        { sectionNo: 2, status: 'grading' },
      ],
    }
    mockGetOralExamSession.mockResolvedValue(allSubmitted)

    await expect(callPage()).rejects.toThrow(`REDIRECT:/app/elp/report/${SESSION_ID}`)
    expect(mockRedirect).toHaveBeenCalledWith(`/app/elp/report/${SESSION_ID}`)
  })
})
