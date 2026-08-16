import { fireEvent, render, screen } from '@testing-library/react'
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

  it('submits the trimmed answer text when Enter is pressed', async () => {
    const onSubmit = vi.fn()
    render(<ShortAnswerInput onSubmit={onSubmit} disabled={false} />)
    const input = screen.getByTestId('short-answer-input')
    await userEvent.type(input, '  cleared to land  ')
    await userEvent.keyboard('{Enter}')
    expect(onSubmit).toHaveBeenCalledWith('cleared to land')
  })

  it('leaves an in-progress IME composition alone instead of submitting it', async () => {
    const onSubmit = vi.fn()
    render(<ShortAnswerInput onSubmit={onSubmit} disabled={false} />)
    const input = screen.getByTestId('short-answer-input')
    await userEvent.type(input, 'roger')
    // fireEvent returns false when the event's default was prevented — cancelling the keypress
    // that commits an IME candidate is what loses the student's text.
    const notCancelled = fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
    expect(onSubmit).not.toHaveBeenCalled()
    expect(notCancelled).toBe(true)
  })

  it('does not submit while a legacy IME composition is in progress', async () => {
    const onSubmit = vi.fn()
    render(<ShortAnswerInput onSubmit={onSubmit} disabled={false} />)
    const input = screen.getByTestId('short-answer-input')
    await userEvent.type(input, 'roger')
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 })
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('does not submit on Enter while the field is empty', async () => {
    const onSubmit = vi.fn()
    render(<ShortAnswerInput onSubmit={onSubmit} disabled={false} />)
    screen.getByTestId('short-answer-input').focus()
    await userEvent.keyboard('{Enter}')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('focuses the answer field on mount so the student can type immediately', () => {
    render(<ShortAnswerInput onSubmit={vi.fn()} disabled={false} />)
    expect(screen.getByTestId('short-answer-input')).toHaveFocus()
  })

  it('shows a spinner and disables Submit while the answer is being checked', async () => {
    render(<ShortAnswerInput onSubmit={vi.fn()} disabled={false} submitting />)
    await userEvent.type(screen.getByTestId('short-answer-input'), 'roger')
    const button = screen.getByRole('button', { name: /submit answer/i })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
  })

  it('still accepts typing on a fresh question while an earlier answer is being checked', () => {
    // `submitting` is a SESSION-WIDE in-flight flag, so it is true here for an UNANSWERED
    // question whenever the student answered the previous one and clicked Next before its round
    // trip returned. This control must stay enabled in that state: it is the only input with
    // autoFocus, and React applies autoFocus by calling .focus() at mount, which is a no-op on a
    // disabled element with nothing to refocus it when the flag clears.
    // Goes red if `|| submitting` is added to the input's disabled prop — which was done once,
    // on a CR finding whose premise did not hold, and reverted after tracing the flag's scope.
    render(<ShortAnswerInput onSubmit={vi.fn()} disabled={false} submitting />)
    expect(screen.getByTestId('short-answer-input')).not.toBeDisabled()
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

  it('announces a correct result to screen readers once graded', () => {
    render(
      <ShortAnswerInput
        onSubmit={vi.fn()}
        disabled={false}
        submittedText="cleared to land"
        isCorrect
        correctAnswer="cleared to land"
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Correct')
  })

  it('announces an incorrect result to screen readers once graded', () => {
    render(
      <ShortAnswerInput
        onSubmit={vi.fn()}
        disabled={false}
        submittedText="go around"
        isCorrect={false}
        correctAnswer="cleared to land"
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Incorrect')
  })

  it('does not announce a result before an answer is graded', () => {
    render(<ShortAnswerInput onSubmit={vi.fn()} disabled={false} />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
