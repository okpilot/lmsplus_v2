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

  it('renders the subject name in the card heading', () => {
    renderBriefing({ subjectName: 'VFR Radiotelephony (RT)' })
    expect(screen.getByRole('heading', { name: 'VFR Radiotelephony (RT)' })).toBeInTheDocument()
  })

  it('shows a generic fallback error and does not navigate when the action throws', async () => {
    mockStartVfrRtExam.mockRejectedValue(new Error('network failure'))
    renderBriefing()

    await userEvent.click(screen.getByRole('button', { name: /start exam/i }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        /something went wrong\. please try again\./i,
      ),
    )
    expect(mockRouterPush).not.toHaveBeenCalled()
  })

  it('clears a previous error when the user retries and the action succeeds', async () => {
    mockStartVfrRtExam
      .mockResolvedValueOnce({ success: false, error: 'Session limit reached.' })
      .mockResolvedValueOnce({
        success: true,
        sessionId: 'sess-retry',
        questionIds: ['q-1'],
        timeLimitSeconds: 1800,
        parts: { p1End: 8, p2End: 17, p3End: 25 },
        startedAt: '2026-06-19T10:00:00.000Z',
      })
    renderBriefing()

    await userEvent.click(screen.getByRole('button', { name: /start exam/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: /start exam/i }))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(mockRouterPush).toHaveBeenCalledWith('/app/vfr-rt-exam/in-progress/sess-retry')
  })

  it('disables the Start button and shows loading text while the action is pending', async () => {
    // Return a promise that never resolves so isPending stays true long enough to observe.
    mockStartVfrRtExam.mockReturnValue(new Promise(() => {}))
    renderBriefing()

    const button = screen.getByRole('button', { name: /start exam/i })
    // Fire click without awaiting full settlement so we can inspect mid-flight state.
    await userEvent.click(button)

    // After the transition starts the button should be disabled and show loading text.
    const loadingButton = screen.getByRole('button', { name: /starting…/i })
    expect(loadingButton).toBeDisabled()
  })
})
