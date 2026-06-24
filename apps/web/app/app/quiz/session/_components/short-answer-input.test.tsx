import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ShortAnswerInput } from './short-answer-input'

beforeEach(() => {
  vi.resetAllMocks()
})

describe('ShortAnswerInput', () => {
  it('disables Submit until the field has non-whitespace text', async () => {
    const onSubmit = vi.fn()
    render(<ShortAnswerInput onSubmit={onSubmit} disabled={false} />)
    const button = screen.getByRole('button', { name: /submit answer/i })
    expect(button).toBeDisabled()

    await userEvent.type(screen.getByTestId('short-answer-input'), '   ')
    expect(button).toBeDisabled()

    await userEvent.type(screen.getByTestId('short-answer-input'), 'roger')
    expect(button).toBeEnabled()
  })

  it('submits the trimmed answer text when Submit is clicked', async () => {
    const onSubmit = vi.fn()
    render(<ShortAnswerInput onSubmit={onSubmit} disabled={false} />)
    await userEvent.type(screen.getByTestId('short-answer-input'), '  cleared to land  ')
    await userEvent.click(screen.getByRole('button', { name: /submit answer/i }))
    expect(onSubmit).toHaveBeenCalledWith('cleared to land')
  })

  it('shows a spinner and disables Submit while the answer is being checked', async () => {
    render(<ShortAnswerInput onSubmit={vi.fn()} disabled={false} submitting />)
    await userEvent.type(screen.getByTestId('short-answer-input'), 'roger')
    const button = screen.getByRole('button', { name: /submit answer/i })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
  })

  it('hides Submit once an answer is submitted even while grading is still pending', () => {
    render(
      <ShortAnswerInput
        onSubmit={vi.fn()}
        disabled={false}
        submittedText="cleared to land"
        isCorrect={null}
        correctAnswer={null}
      />,
    )
    expect(screen.queryByRole('button', { name: /submit answer/i })).not.toBeInTheDocument()
  })

  it('locks the field and hides Submit once an answer has been submitted', () => {
    render(
      <ShortAnswerInput
        onSubmit={vi.fn()}
        disabled={false}
        submittedText="cleared to land"
        isCorrect
        correctAnswer="cleared to land"
      />,
    )
    expect(screen.getByTestId('short-answer-input')).toBeDisabled()
    expect(screen.queryByRole('button', { name: /submit answer/i })).not.toBeInTheDocument()
  })

  it('reveals the canonical answer after a wrong submission', () => {
    render(
      <ShortAnswerInput
        onSubmit={vi.fn()}
        disabled={false}
        submittedText="go around"
        isCorrect={false}
        correctAnswer="cleared to land"
      />,
    )
    expect(screen.getByTestId('revealed-answer')).toHaveTextContent('cleared to land')
  })

  it('does not reveal the canonical answer after a correct submission', () => {
    render(
      <ShortAnswerInput
        onSubmit={vi.fn()}
        disabled={false}
        submittedText="cleared to land"
        isCorrect
        correctAnswer="cleared to land"
      />,
    )
    expect(screen.queryByTestId('revealed-answer')).not.toBeInTheDocument()
  })
})
