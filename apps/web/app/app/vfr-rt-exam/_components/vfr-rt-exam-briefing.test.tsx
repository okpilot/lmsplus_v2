import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRouterPush, mockStartVfrRtExam } = vi.hoisted(() => ({
  mockRouterPush: vi.fn(),
  mockStartVfrRtExam: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}))

vi.mock('@/app/app/vfr-rt-exam/actions/start', () => ({
  startVfrRtExam: (...args: unknown[]) => mockStartVfrRtExam(...args),
}))

import { VfrRtExamBriefing } from './vfr-rt-exam-briefing'

function renderBriefing(props?: Partial<{ subjectId: string; subjectName: string }>) {
  return render(
    <VfrRtExamBriefing
      subjectId={props?.subjectId ?? 'subj-rt'}
      subjectName={props?.subjectName ?? 'VFR Radiotelephony'}
    />,
  )
}

describe('VfrRtExamBriefing', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('navigates to the in-progress route with the session id on successful start', async () => {
    mockStartVfrRtExam.mockResolvedValue({
      success: true,
      sessionId: 'sess-xyz',
      questionIds: ['q-1'],
      timeLimitSeconds: 1800,
      parts: { p1End: 8, p2End: 17, p3End: 25 },
      startedAt: '2026-06-19T10:00:00.000Z',
    })
    renderBriefing()

    await userEvent.click(screen.getByRole('button', { name: /start exam/i }))

    await waitFor(() =>
      expect(mockRouterPush).toHaveBeenCalledWith('/app/vfr-rt-exam/in-progress/sess-xyz'),
    )
  })

  it('surfaces the action error in a role="alert" element and does not navigate on failure', async () => {
    mockStartVfrRtExam.mockResolvedValue({
      success: false,
      error: 'No questions available for this exam.',
    })
    renderBriefing()

    await userEvent.click(screen.getByRole('button', { name: /start exam/i }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/no questions available for this exam/i),
    )
    expect(mockRouterPush).not.toHaveBeenCalled()
  })

  it('renders the three-part structure of the exam in the briefing copy', () => {
    renderBriefing()
    expect(screen.getByText(/part 1/i)).toBeInTheDocument()
    expect(screen.getByText(/part 2/i)).toBeInTheDocument()
    expect(screen.getByText(/part 3/i)).toBeInTheDocument()
  })
})
