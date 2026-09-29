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

const SUBJECTS = [{ id: 's-rt', code: 'RT', name: 'VFR RT', short: 'RT', questionCount: 3 }]

function renderPanel() {
  return render(<VfrRtExamPanel userId="user-1" subjectId="s-rt" subjects={SUBJECTS} />)
}

beforeEach(() => {
  vi.resetAllMocks()
  mockUseVfrRtExamStart.mockReturnValue({
    loading: false,
    error: null,
    handleStart: mockHandleStart,
  })
})

describe('VfrRtExamPanel', () => {
  it('states the time limit, part count and per-part pass mark', () => {
    renderPanel()
    expect(screen.getByText('30 min')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('75%')).toBeInTheDocument()
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
      userId: 'user-1',
      subjectId: 's-rt',
      subjects: SUBJECTS,
    })
  })

  it('shows the start error as an alert', () => {
    mockUseVfrRtExamStart.mockReturnValue({
      loading: false,
      error: 'No exam configured',
      handleStart: mockHandleStart,
    })
    renderPanel()
    expect(screen.getByRole('alert')).toHaveTextContent('No exam configured')
  })

  it('disables the start button while starting', () => {
    mockUseVfrRtExamStart.mockReturnValue({
      loading: true,
      error: null,
      handleStart: mockHandleStart,
    })
    renderPanel()
    expect(screen.getByRole('button', { name: /starting/i })).toBeDisabled()
  })
})
