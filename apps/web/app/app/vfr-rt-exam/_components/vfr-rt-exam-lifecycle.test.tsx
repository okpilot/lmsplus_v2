import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VfrRtQuestion } from '@/lib/queries/vfr-rt-exam'

// Lifecycle integration test (code-style.md §7): connects the client stages of the
// VFR RT exam flow — entry (briefing) → in-progress (runner) → exit → post-exit URL —
// asserting the URL contract that links them. The three page.tsx files redirect
// server-side (async Server Components) and are not jsdom-testable; the full
// browser lifecycle is covered by the Phase E Playwright E2E (spec task E.1).

const { mockPush, mockStart, mockSubmit } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockStart: vi.fn(),
  mockSubmit: vi.fn(),
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }))
vi.mock('@/app/app/vfr-rt-exam/actions/start', () => ({ startVfrRtExam: mockStart }))
vi.mock('../actions/submit', () => ({ submitVfrRtExam: mockSubmit }))
vi.mock('@/app/app/quiz/_components/exam-countdown-timer', () => ({
  ExamCountdownTimer: () => <span role="timer">30:00</span>,
}))

import { VfrRtExamBriefing } from './vfr-rt-exam-briefing'
import { VfrRtExamRunner } from './vfr-rt-exam-runner'

function shortQ(id: string): VfrRtQuestion {
  return {
    id,
    question_type: 'short_answer',
    question_text: `Question ${id}`,
    question_image_url: null,
    subject_code: 'RT',
    topic_code: 'P1_ACRONYMS',
    difficulty: 'easy',
    question_number: id,
    options: null,
    dialog_template: null,
    blanks_safe: null,
  }
}

describe('VFR RT exam lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('routes entry → in-progress → results with the correct URLs across the flow', async () => {
    const user = userEvent.setup()

    // 1. Entry: briefing Start → navigates to the in-progress runner for the new session.
    mockStart.mockResolvedValue({
      success: true,
      sessionId: 's1',
      questionIds: ['1'],
      timeLimitSeconds: 1800,
      parts: { p1End: 8, p2End: 17, p3End: 25 },
      startedAt: '2026-06-20T10:00:00.000Z',
    })
    const briefing = render(<VfrRtExamBriefing subjectId="subj-rt" subjectName="VFR RT" />)
    await user.click(screen.getByRole('button', { name: /start exam/i }))
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/app/vfr-rt-exam/in-progress/s1'))
    briefing.unmount()

    // 2. In-progress → exit: the runner for that same session submits → results URL.
    mockSubmit.mockResolvedValue({
      success: true,
      session_id: 's1',
      redirect_to: '/app/vfr-rt-exam/results/s1',
    })
    render(
      <VfrRtExamRunner
        sessionId="s1"
        startedAt="2026-06-20T10:00:00.000Z"
        timeLimitSeconds={1800}
        questions={[shortQ('1')]}
      />,
    )
    await user.click(screen.getByRole('button', { name: /finish & submit exam/i }))
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/app/vfr-rt-exam/results/s1'))
  })
})
