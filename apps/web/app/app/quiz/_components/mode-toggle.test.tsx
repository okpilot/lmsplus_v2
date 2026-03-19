import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ModeToggle } from './mode-toggle'

// ---- Tests ------------------------------------------------------------------

describe('ModeToggle', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders Study and Exam buttons', () => {
    render(<ModeToggle value="study" onValueChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: /study/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /exam/i })).toBeInTheDocument()
  })

  it('calls onValueChange with "study" when Study button is clicked', async () => {
    const onValueChange = vi.fn()
    const user = userEvent.setup()
    render(<ModeToggle value="exam" onValueChange={onValueChange} />)
    await user.click(screen.getByRole('button', { name: /study/i }))
    expect(onValueChange).toHaveBeenCalledWith('study')
  })

  it('does not call onValueChange when Exam button is clicked because it is disabled', async () => {
    const onValueChange = vi.fn()
    const user = userEvent.setup()
    render(<ModeToggle value="study" onValueChange={onValueChange} />)
    await user.click(screen.getByRole('button', { name: /exam/i }))
    expect(onValueChange).not.toHaveBeenCalled()
  })

  it('shows "Coming soon" badge on the Exam button', () => {
    render(<ModeToggle value="study" onValueChange={vi.fn()} />)
    expect(screen.getByText('Coming soon')).toBeInTheDocument()
  })

  it('Exam button is disabled', () => {
    render(<ModeToggle value="study" onValueChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: /exam/i })).toBeDisabled()
  })

  it('Exam button does not carry aria-pressed', () => {
    // ExamButton is not a toggle — it was extracted without aria-pressed so
    // screen readers do not announce it as a pressable toggle control.
    render(<ModeToggle value="study" onValueChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: /exam/i })).not.toHaveAttribute('aria-pressed')
  })

  it('Study button reflects aria-pressed true when study mode is active', () => {
    render(<ModeToggle value="study" onValueChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: /study/i })).toHaveAttribute('aria-pressed', 'true')
  })

  it('Study button reflects aria-pressed false when exam mode is active', () => {
    render(<ModeToggle value="exam" onValueChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: /study/i })).toHaveAttribute('aria-pressed', 'false')
  })
})
