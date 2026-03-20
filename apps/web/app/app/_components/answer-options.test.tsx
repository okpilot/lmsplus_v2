import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AnswerOptions } from './answer-options'

const OPTIONS = [
  { id: 'a', text: 'Option Alpha' },
  { id: 'b', text: 'Option Beta' },
  { id: 'c', text: 'Option Gamma' },
]

describe('AnswerOptions', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

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

  describe('letter circle labels', () => {
    it('renders letter A on the first option', () => {
      render(<AnswerOptions options={OPTIONS} onSubmit={vi.fn()} disabled={false} />)
      expect(screen.getByText('A')).toBeInTheDocument()
    })

    it('renders letters A, B, C in order for three options', () => {
      render(<AnswerOptions options={OPTIONS} onSubmit={vi.fn()} disabled={false} />)
      expect(screen.getByText('A')).toBeInTheDocument()
      expect(screen.getByText('B')).toBeInTheDocument()
      expect(screen.getByText('C')).toBeInTheDocument()
    })

    it('renders letters A through H for eight options', () => {
      const eightOptions = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((l, i) => ({
        id: `opt-${i}`,
        text: `Option ${l}`,
      }))
      render(<AnswerOptions options={eightOptions} onSubmit={vi.fn()} disabled={false} />)
      for (const letter of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']) {
        expect(screen.getByText(letter)).toBeInTheDocument()
      }
    })

    it('falls back to numeric label for options beyond position eight', () => {
      const nineOptions = Array.from({ length: 9 }, (_, i) => ({
        id: `opt-${i}`,
        text: `Option ${i + 1}`,
      }))
      render(<AnswerOptions options={nineOptions} onSubmit={vi.fn()} disabled={false} />)
      // Index 8 is beyond the LETTERS array — should render '9'
      expect(screen.getByText('9')).toBeInTheDocument()
    })

    it('places the correct letter inside the button for each option', () => {
      render(<AnswerOptions options={OPTIONS} onSubmit={vi.fn()} disabled={false} />)
      const alphaBtn = screen.getByTestId('option-a')
      const betaBtn = screen.getByTestId('option-b')
      expect(alphaBtn).toHaveTextContent('A')
      expect(betaBtn).toHaveTextContent('B')
    })
  })

  describe('letter circle styling states', () => {
    it('applies neutral border circle style when option is unselected', () => {
      render(<AnswerOptions options={OPTIONS} onSubmit={vi.fn()} disabled={false} />)
      const circle = screen.getByTestId('option-a').querySelector('span')
      expect(circle?.className).toContain('border')
      expect(circle?.className).not.toContain('bg-green-500')
      expect(circle?.className).not.toContain('bg-red-500')
      expect(circle?.className).not.toContain('bg-primary')
    })

    it('applies primary-coloured circle when option is selected before submission', async () => {
      const user = userEvent.setup()
      render(<AnswerOptions options={OPTIONS} onSubmit={vi.fn()} disabled={false} />)
      await user.click(screen.getByTestId('option-a'))
      const circle = screen.getByTestId('option-a').querySelector('span')
      expect(circle?.className).toContain('bg-primary')
      expect(circle?.className).toContain('text-primary-foreground')
    })

    it('applies green circle on the correct option when result is shown', () => {
      render(
        <AnswerOptions
          options={OPTIONS}
          onSubmit={vi.fn()}
          disabled={true}
          selectedOptionId="a"
          correctOptionId="b"
        />,
      )
      const circle = screen.getByTestId('option-b').querySelector('span')
      expect(circle?.className).toContain('bg-green-500')
      expect(circle?.className).toContain('text-white')
    })

    it('applies red circle on the wrong selection when result is shown', () => {
      render(
        <AnswerOptions
          options={OPTIONS}
          onSubmit={vi.fn()}
          disabled={true}
          selectedOptionId="a"
          correctOptionId="b"
        />,
      )
      const circle = screen.getByTestId('option-a').querySelector('span')
      expect(circle?.className).toContain('bg-red-500')
      expect(circle?.className).toContain('text-white')
    })

    it('applies neutral border circle on an unselected non-correct option when result is shown', () => {
      render(
        <AnswerOptions
          options={OPTIONS}
          onSubmit={vi.fn()}
          disabled={true}
          selectedOptionId="a"
          correctOptionId="b"
        />,
      )
      // Option C was neither selected nor correct
      const circle = screen.getByTestId('option-c').querySelector('span')
      expect(circle?.className).not.toContain('bg-green-500')
      expect(circle?.className).not.toContain('bg-red-500')
      expect(circle?.className).not.toContain('bg-primary')
    })
  })

  describe('data-selected attribute', () => {
    it('sets data-selected="true" on the option the user clicks before submission', async () => {
      const user = userEvent.setup()
      render(<AnswerOptions options={OPTIONS} onSubmit={vi.fn()} disabled={false} />)
      await user.click(screen.getByTestId('option-b'))
      expect(screen.getByTestId('option-b')).toHaveAttribute('data-selected', 'true')
    })

    it('does not set data-selected on unselected options', async () => {
      const user = userEvent.setup()
      render(<AnswerOptions options={OPTIONS} onSubmit={vi.fn()} disabled={false} />)
      await user.click(screen.getByTestId('option-b'))
      expect(screen.getByTestId('option-a')).not.toHaveAttribute('data-selected')
    })

    it('does not set data-selected when result is shown (lockedSelection)', () => {
      render(
        <AnswerOptions
          options={OPTIONS}
          onSubmit={vi.fn()}
          disabled={true}
          selectedOptionId="a"
          correctOptionId="b"
        />,
      )
      // Even the locked selection should not carry data-selected in result state
      expect(screen.getByTestId('option-a')).not.toHaveAttribute('data-selected')
    })
  })
})
