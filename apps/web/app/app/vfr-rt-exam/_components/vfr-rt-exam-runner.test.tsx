import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VfrRtQuestion } from '@/lib/queries/vfr-rt-exam'

const { mockPush, mockSubmit, lastTimerProps } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockSubmit: vi.fn(),
  lastTimerProps: { current: null as null | { onExpired: () => void } },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

vi.mock('../actions/submit', () => ({
  submitVfrRtExam: (...args: unknown[]) => mockSubmit(...args),
}))

// Capture the timer's onExpired so a test can trigger expiry deterministically.
vi.mock('@/app/app/quiz/_components/exam-countdown-timer', () => ({
  ExamCountdownTimer: (props: { onExpired: () => void }) => {
    lastTimerProps.current = props
    return <span role="timer">10:00</span>
  },
}))

import { VfrRtExamRunner } from './vfr-rt-exam-runner'

function q(id: string, type: VfrRtQuestion['question_type']): VfrRtQuestion {
  return {
    id,
    question_type: type,
    question_text: `Question ${id}`,
    question_image_url: null,
    subject_code: 'RT',
    topic_code: 'RT.1',
    difficulty: 'easy',
    question_number: id,
    options: type === 'multiple_choice' ? [{ id: 'opt-a', text: 'Alpha' }] : null,
    dialog_template: null,
    blanks_safe: null,
  }
}

function renderRunner() {
  return render(
    <VfrRtExamRunner
      sessionId="s1"
      startedAt="2026-06-19T10:00:00.000Z"
      timeLimitSeconds={1800}
      questions={[q('1', 'short_answer'), q('2', 'multiple_choice')]}
    />,
  )
}

describe('VfrRtExamRunner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    lastTimerProps.current = null
  })

  it('shows the timer and the first question when resuming with empty local answers', () => {
    renderRunner()
    expect(screen.getByRole('timer')).toBeInTheDocument()
    expect(screen.getByText('Question 1')).toBeInTheDocument()
  })

  it('navigates to the results page after a successful submit', async () => {
    mockSubmit.mockResolvedValue({
      success: true,
      session_id: 's1',
      redirect_to: '/app/vfr-rt-exam/results/s1',
    })
    renderRunner()

    await userEvent.click(screen.getByRole('button', { name: /finish & submit exam/i }))

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/app/vfr-rt-exam/results/s1'))
  })

  it('submits and navigates to results when the timer expires', async () => {
    mockSubmit.mockResolvedValue({
      success: true,
      session_id: 's1',
      redirect_to: '/app/vfr-rt-exam/results/s1',
    })
    renderRunner()

    lastTimerProps.current?.onExpired()

    await waitFor(() => expect(mockSubmit).toHaveBeenCalled())
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/app/vfr-rt-exam/results/s1'))
  })

  it('submits only once when a finish click and a timer expiry interleave', async () => {
    mockSubmit.mockResolvedValue({
      success: true,
      session_id: 's1',
      redirect_to: '/app/vfr-rt-exam/results/s1',
    })
    renderRunner()

    // The documented race: a manual Finish click and a near-simultaneous timer
    // expiry. fireEvent.click runs handleSubmit synchronously (setting the ref
    // gate), then the expiry hits the same gate and must be a no-op — one submit.
    fireEvent.click(screen.getByRole('button', { name: /finish & submit exam/i }))
    lastTimerProps.current?.onExpired()

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/app/vfr-rt-exam/results/s1'))
    expect(mockSubmit).toHaveBeenCalledTimes(1)
  })

  it('shows the error in an alert and does not navigate when submit fails', async () => {
    mockSubmit.mockResolvedValue({ success: false, error: 'Failed to submit exam' })
    renderRunner()

    await userEvent.click(screen.getByRole('button', { name: /finish & submit exam/i }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/failed to submit exam/i),
    )
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('displays the next question after clicking the Next button', async () => {
    renderRunner()
    // Question 1 (short_answer) is shown initially; question 2 (MC) must appear after Next.
    expect(screen.getByText('Question 1')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /next/i }))
    expect(screen.getByText('Question 2')).toBeInTheDocument()
    expect(screen.queryByText('Question 1')).not.toBeInTheDocument()
  })

  it('increments the Part 1 answered count in progress after the user types a short answer', async () => {
    renderRunner()
    const part1Bar = screen.getByRole('progressbar', { name: 'Part 1' })
    expect(part1Bar).toHaveAttribute('aria-valuenow', '0')

    await userEvent.type(screen.getByRole('textbox'), 'QNH')

    expect(part1Bar).toHaveAttribute('aria-valuenow', '1')
  })
})
