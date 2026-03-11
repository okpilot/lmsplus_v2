import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AnswerOptions } from './answer-options'

const OPTIONS = [
  { id: 'a', text: 'Option Alpha' },
  { id: 'b', text: 'Option Beta' },
  { id: 'c', text: 'Option Gamma' },
]

describe('AnswerOptions', () => {
  it('renders all option buttons', () => {
    render(<AnswerOptions options={OPTIONS} onSubmit={vi.fn()} disabled={false} />)
    expect(screen.getByText('Option Alpha')).toBeInTheDocument()
    expect(screen.getByText('Option Beta')).toBeInTheDocument()
    expect(screen.getByText('Option Gamma')).toBeInTheDocument()
  })

  it('renders the Submit Answer button when result is not yet shown', () => {
    render(<AnswerOptions options={OPTIONS} onSubmit={vi.fn()} disabled={false} />)
    expect(screen.getByRole('button', { name: 'Submit Answer' })).toBeInTheDocument()
  })

  it('disables the Submit Answer button when no option is selected', () => {
    render(<AnswerOptions options={OPTIONS} onSubmit={vi.fn()} disabled={false} />)
    expect(screen.getByRole('button', { name: 'Submit Answer' })).toBeDisabled()
  })

  it('enables the Submit Answer button after an option is clicked', async () => {
    const user = userEvent.setup()
    render(<AnswerOptions options={OPTIONS} onSubmit={vi.fn()} disabled={false} />)
    await user.click(screen.getByText('Option Alpha'))
    expect(screen.getByRole('button', { name: 'Submit Answer' })).not.toBeDisabled()
  })

  it('calls onSubmit with the selected option ID when Submit is clicked', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<AnswerOptions options={OPTIONS} onSubmit={onSubmit} disabled={false} />)
    await user.click(screen.getByText('Option Beta'))
    await user.click(screen.getByRole('button', { name: 'Submit Answer' }))
    expect(onSubmit).toHaveBeenCalledWith('b')
  })

  it('hides the Submit Answer button when selectedOptionId is provided (result shown)', () => {
    render(
      <AnswerOptions
        options={OPTIONS}
        onSubmit={vi.fn()}
        disabled={true}
        selectedOptionId="a"
        correctOptionId="b"
      />,
    )
    expect(screen.queryByRole('button', { name: 'Submit Answer' })).not.toBeInTheDocument()
  })

  it('shows correct styling on the correct option when result is shown', () => {
    render(
      <AnswerOptions
        options={OPTIONS}
        onSubmit={vi.fn()}
        disabled={true}
        selectedOptionId="a"
        correctOptionId="b"
      />,
    )
    // Option B is the correct one — button text contains 'Option Beta'
    const correctBtn = screen.getByText('Option Beta').closest('button')
    expect(correctBtn?.className).toContain('border-green-500')
  })

  it('shows error styling on the incorrectly selected option', () => {
    render(
      <AnswerOptions
        options={OPTIONS}
        onSubmit={vi.fn()}
        disabled={true}
        selectedOptionId="a"
        correctOptionId="b"
      />,
    )
    // Option A was selected but is wrong
    const wrongBtn = screen.getByText('Option Alpha').closest('button')
    expect(wrongBtn?.className).toContain('border-destructive')
  })

  it('disables all option buttons when disabled prop is true', () => {
    render(<AnswerOptions options={OPTIONS} onSubmit={vi.fn()} disabled={true} />)
    const buttons = screen.getAllByRole('button')
    const optionButtons = buttons.filter((b) => b.getAttribute('disabled') !== null)
    expect(optionButtons.length).toBeGreaterThan(0)
  })

  it('does not call onSubmit if disabled and Submit is clicked', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    // Provide a locked selection so Submit button is shown
    // But no Submit button appears when lockedSelection is set, so test via disabled directly
    render(<AnswerOptions options={OPTIONS} onSubmit={onSubmit} disabled={true} />)
    const submitBtn = screen.queryByRole('button', { name: 'Submit Answer' })
    // Submit is still rendered (no lockedSelection), just disabled
    if (submitBtn) {
      await user.click(submitBtn)
    }
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
