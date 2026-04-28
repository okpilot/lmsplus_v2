import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ModeToggle } from './mode-toggle'

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
    render(<ModeToggle value="exam" onValueChange={onValueChange} examAvailable />)
    await user.click(screen.getByRole('button', { name: /study/i }))
    expect(onValueChange).toHaveBeenCalledWith('study')
  })

  it('calls onValueChange with "exam" when Exam button is clicked and available', async () => {
    const onValueChange = vi.fn()
    const user = userEvent.setup()
    render(<ModeToggle value="study" onValueChange={onValueChange} examAvailable />)
    await user.click(screen.getByRole('button', { name: /exam/i }))
    expect(onValueChange).toHaveBeenCalledWith('exam')
  })

  it('disables Exam button when examAvailable is false', () => {
    render(<ModeToggle value="study" onValueChange={vi.fn()} examAvailable={false} />)
    expect(screen.getByRole('button', { name: /exam/i })).toBeDisabled()
  })

  it('does not call onValueChange when Exam button is disabled', async () => {
    const onValueChange = vi.fn()
    const user = userEvent.setup()
    render(<ModeToggle value="study" onValueChange={onValueChange} examAvailable={false} />)
    await user.click(screen.getByRole('button', { name: /exam/i }))
    expect(onValueChange).not.toHaveBeenCalled()
  })

  it('enables Exam button when examAvailable is true', () => {
    render(<ModeToggle value="study" onValueChange={vi.fn()} examAvailable />)
    expect(screen.getByRole('button', { name: /exam/i })).not.toBeDisabled()
  })

  it('shows exam mode description when exam is selected', () => {
    render(<ModeToggle value="exam" onValueChange={vi.fn()} examAvailable />)
    expect(screen.getByText(/timed with no hints/i)).toBeInTheDocument()
  })

  it('shows study mode description when study is selected', () => {
    render(<ModeToggle value="study" onValueChange={vi.fn()} />)
    expect(screen.getByText(/explanations after each answer/i)).toBeInTheDocument()
  })

  it('Study button reflects aria-pressed true when study mode is active', () => {
    render(<ModeToggle value="study" onValueChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: /study/i })).toHaveAttribute('aria-pressed', 'true')
  })

  it('Exam button reflects aria-pressed true when exam mode is active', () => {
    render(<ModeToggle value="exam" onValueChange={vi.fn()} examAvailable />)
    expect(screen.getByRole('button', { name: /exam/i })).toHaveAttribute('aria-pressed', 'true')
  })
})
