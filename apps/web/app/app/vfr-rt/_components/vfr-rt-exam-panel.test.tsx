import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockUseVfrRtExamStart, mockHandleStart } = vi.hoisted(() => ({
  mockUseVfrRtExamStart: vi.fn(),
  mockHandleStart: vi.fn(),
}))

vi.mock('../_hooks/use-vfr-rt-exam-start', () => ({
  useVfrRtExamStart: (...args: unknown[]) => mockUseVfrRtExamStart(...args),
}))

import { VfrRtExamPanel } from './vfr-rt-exam-panel'

const IDLE = { offer: null, saving: false, error: null, onAccept: vi.fn() }

const SUBJECTS = [{ id: 's-rt', code: 'RT', name: 'VFR RT', short: 'RT', questionCount: 3 }]

function renderPanel(questionCount: number | null = null) {
  return render(
    <VfrRtExamPanel subjectId="s-rt" subjects={SUBJECTS} questionCount={questionCount} />,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  mockUseVfrRtExamStart.mockReturnValue({
    loading: false,
    error: null,
    handleStart: mockHandleStart,
    blocked: IDLE,
  })
})

describe('VfrRtExamPanel', () => {
  it('states the time limit, part count and per-part pass mark', () => {
    renderPanel()
    expect(screen.getByText('30 min')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('75%')).toBeInTheDocument()
  })

  it('shows the total question count when it is known', () => {
    renderPanel(25)
    expect(screen.getByText('25')).toBeInTheDocument()
    expect(screen.getByText('Questions')).toBeInTheDocument()
  })

  it('hides the question count when it is not known', () => {
    renderPanel(null)
    expect(screen.queryByText('Questions')).toBeNull()
  })

  it('shows the fixed 30 minute time limit', () => {
    renderPanel()
    expect(screen.getByText('30 min')).toBeInTheDocument()
  })

  it('starts the exam when the start button is clicked', async () => {
    const user = userEvent.setup()
    renderPanel()
    await user.click(screen.getByRole('button', { name: 'Start VFR RT Mock Exam' }))
    expect(mockHandleStart).toHaveBeenCalledTimes(1)
  })

  it('passes the user, subject id and subjects to the start hook', () => {
    renderPanel()
    expect(mockUseVfrRtExamStart).toHaveBeenCalledWith({
      subjectId: 's-rt',
      subjects: SUBJECTS,
    })
  })

  it('shows the start error as an alert', () => {
    mockUseVfrRtExamStart.mockReturnValue({
      loading: false,
      error: 'No exam configured',
      handleStart: mockHandleStart,
      blocked: IDLE,
    })
    renderPanel()
    expect(screen.getByRole('alert')).toHaveTextContent('No exam configured')
  })

  it('disables the start button while starting', () => {
    mockUseVfrRtExamStart.mockReturnValue({
      loading: true,
      error: null,
      handleStart: mockHandleStart,
      blocked: IDLE,
    })
    renderPanel()
    expect(screen.getByRole('button', { name: /starting/i })).toBeDisabled()
  })

  it('offers to save the open practice quiz when the start is blocked', async () => {
    const onAccept = vi.fn()
    mockUseVfrRtExamStart.mockReturnValue({
      loading: false,
      error: 'Another session is active',
      handleStart: mockHandleStart,
      blocked: { ...IDLE, onAccept, offer: { sessionId: 'b-1', subjectName: 'Air Law' } },
    })
    renderPanel()

    await userEvent.click(
      screen.getByRole('button', { name: 'Save quiz for later and start the exam' }),
    )

    expect(onAccept).toHaveBeenCalledTimes(1)
  })
})
