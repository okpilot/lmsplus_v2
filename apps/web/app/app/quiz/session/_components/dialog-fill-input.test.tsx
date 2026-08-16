import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DialogFillInput } from './dialog-fill-input'

const TEMPLATE = '[atc] {{0}} runway {{1}}.'

beforeEach(() => {
  vi.resetAllMocks()
})

describe('DialogFillInput', () => {
  it('renders one input per blank in the template', () => {
    render(<DialogFillInput template={TEMPLATE} onSubmit={vi.fn()} disabled={false} />)
    expect(screen.getByTestId('blank-0')).toBeInTheDocument()
    expect(screen.getByTestId('blank-1')).toBeInTheDocument()
  })

  it('keeps Submit disabled until every blank is filled (full-coverage)', async () => {
    render(<DialogFillInput template={TEMPLATE} onSubmit={vi.fn()} disabled={false} />)
    const button = screen.getByRole('button', { name: /submit answer/i })
    expect(button).toBeDisabled()

    await userEvent.type(screen.getByTestId('blank-0'), 'cleared to land')
    expect(button).toBeDisabled()

    await userEvent.type(screen.getByTestId('blank-1'), '27')
    expect(button).toBeEnabled()
  })

  it('submits all blanks with their indices and trimmed text', async () => {
    const onSubmit = vi.fn()
    render(<DialogFillInput template={TEMPLATE} onSubmit={onSubmit} disabled={false} />)
    await userEvent.type(screen.getByTestId('blank-0'), '  cleared to land  ')
    await userEvent.type(screen.getByTestId('blank-1'), '27')
    await userEvent.click(screen.getByRole('button', { name: /submit answer/i }))
    expect(onSubmit).toHaveBeenCalledWith([
      { index: 0, text: 'cleared to land' },
      { index: 1, text: '27' },
    ])
  })

  it('shows a spinner and disables Submit while the answer is being checked', async () => {
    render(<DialogFillInput template={TEMPLATE} onSubmit={vi.fn()} disabled={false} submitting />)
    await userEvent.type(screen.getByTestId('blank-0'), 'x')
    await userEvent.type(screen.getByTestId('blank-1'), 'y')
    const button = screen.getByRole('button', { name: /submit answer/i })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
  })

  it('stops the student editing their answer while it is being checked', () => {
    // Pins the blanks' own disabled state, not the button's. The submitted payload is collected
    // before the request starts, so an edit here cannot corrupt it — but the control locks
    // afterwards without re-seeding, which would leave edited text on screen beside feedback for
    // a different payload. Asserting the attribute directly rather than by typing: once the input
    // is disabled, a type-then-assert-onSubmit-not-called test passes because typing is a no-op,
    // which is true whether or not this guard exists.
    render(<DialogFillInput template={TEMPLATE} onSubmit={vi.fn()} disabled={false} submitting />)
    expect(screen.getByTestId('blank-0')).toBeDisabled()
    expect(screen.getByTestId('blank-1')).toBeDisabled()
  })

  it('hides Submit once submitted even while grading results are still pending', () => {
    render(<DialogFillInput template={TEMPLATE} onSubmit={vi.fn()} disabled={false} submitted />)
    expect(screen.queryByRole('button', { name: /submit answer/i })).not.toBeInTheDocument()
  })

  it('locks inputs, hides Submit, and reveals canonicals for wrong blanks after submit', () => {
    render(
      <DialogFillInput
        template={TEMPLATE}
        onSubmit={vi.fn()}
        disabled={false}
        submitted
        blanks={[
          { index: 0, isCorrect: true, canonical: 'cleared to land' },
          { index: 1, isCorrect: false, canonical: '27' },
        ]}
      />,
    )
    expect(screen.getByTestId('blank-0')).toBeDisabled()
    expect(screen.queryByRole('button', { name: /submit answer/i })).not.toBeInTheDocument()
    expect(screen.queryByTestId('blank-canonical-0')).not.toBeInTheDocument()
    expect(screen.getByTestId('blank-canonical-1')).toHaveTextContent('27')
  })

  it('announces an incorrect result to screen readers when any blank is wrong', () => {
    render(
      <DialogFillInput
        template={TEMPLATE}
        onSubmit={vi.fn()}
        disabled={false}
        submitted
        blanks={[
          { index: 0, isCorrect: true, canonical: 'cleared to land' },
          { index: 1, isCorrect: false, canonical: '27' },
        ]}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Incorrect')
  })

  it('announces a correct result to screen readers when every blank is right', () => {
    render(
      <DialogFillInput
        template={TEMPLATE}
        onSubmit={vi.fn()}
        disabled={false}
        submitted
        blanks={[
          { index: 0, isCorrect: true, canonical: 'cleared to land' },
          { index: 1, isCorrect: true, canonical: '27' },
        ]}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Correct')
  })

  it('does not announce a result before grading results arrive', () => {
    render(<DialogFillInput template={TEMPLATE} onSubmit={vi.fn()} disabled={false} submitted />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('submits when Enter is pressed and every blank is filled', async () => {
    const onSubmit = vi.fn()
    render(<DialogFillInput template={TEMPLATE} onSubmit={onSubmit} disabled={false} />)
    await userEvent.type(screen.getByTestId('blank-0'), 'cleared to land')
    await userEvent.type(screen.getByTestId('blank-1'), '27{Enter}')
    expect(onSubmit).toHaveBeenCalledWith([
      { index: 0, text: 'cleared to land' },
      { index: 1, text: '27' },
    ])
  })

  it('moves to the next empty blank instead of submitting a half-filled dialogue', async () => {
    const onSubmit = vi.fn()
    render(<DialogFillInput template={TEMPLATE} onSubmit={onSubmit} disabled={false} />)
    await userEvent.type(screen.getByTestId('blank-0'), 'cleared to land{Enter}')
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByTestId('blank-1')).toHaveFocus()
  })

  it('wraps back to an earlier empty blank when Enter is pressed in the last blank', async () => {
    const onSubmit = vi.fn()
    render(<DialogFillInput template={TEMPLATE} onSubmit={onSubmit} disabled={false} />)
    await userEvent.type(screen.getByTestId('blank-1'), '27{Enter}')
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByTestId('blank-0')).toHaveFocus()
  })

  it('advances from the box the student is actually in when a template repeats a blank index', async () => {
    // Both boxes for blank 0 share one value, so identifying the starting box by its index alone
    // resolves to the FIRST one — and Enter in the second box then lands focus back on itself.
    const onSubmit = vi.fn()
    render(
      <DialogFillInput
        template="[atc] {{0}} and {{1}} then {{0}} plus {{2}}."
        onSubmit={onSubmit}
        disabled={false}
      />,
    )
    await userEvent.type(screen.getByTestId('blank-1'), '27')
    await userEvent.type(screen.getAllByTestId('blank-0')[1] as HTMLElement, '{Enter}')
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByTestId('blank-2')).toHaveFocus()
  })

  // NOTE: this test no longer reaches handleSubmit's own `if (disabled || submitting) return`
  // guard. Since the blanks became disabled while a check is in flight, userEvent will not
  // dispatch keydown to them at all, so the keypress never gets as far as the guard — delete that
  // line and this test still passes. It is kept because what it now proves is still worth
  // proving (no submission escapes while one is in flight, by whichever mechanism), and the
  // sibling test above pins the disabled attribute directly. The guard itself remains load-bearing
  // for callers that are not the DOM: a programmatic handleSubmit() consults it and no attribute.
  it('does not submit on Enter while a submission is already in flight', async () => {
    const onSubmit = vi.fn()
    const { rerender } = render(
      <DialogFillInput template={TEMPLATE} onSubmit={onSubmit} disabled={false} />,
    )
    await userEvent.type(screen.getByTestId('blank-0'), 'cleared to land')
    await userEvent.type(screen.getByTestId('blank-1'), '27')
    rerender(
      <DialogFillInput template={TEMPLATE} onSubmit={onSubmit} disabled={false} submitting />,
    )
    await userEvent.type(screen.getByTestId('blank-1'), '{Enter}')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('shows the answer the student gave when a graded question is resumed', () => {
    // Without this the boxes come back empty: a resumed WRONG answer renders as an empty red
    // box beside the correct answer, so the student cannot see what they actually typed.
    render(
      <DialogFillInput
        template={TEMPLATE}
        onSubmit={vi.fn()}
        disabled={false}
        submitted
        blanks={[
          { index: 0, isCorrect: false, canonical: 'cleared to land' },
          { index: 1, isCorrect: true, canonical: '27' },
        ]}
        submittedBlanks={[
          { index: 0, text: 'clear to land' },
          { index: 1, text: '27' },
        ]}
      />,
    )
    expect(screen.getByTestId('blank-0')).toHaveValue('clear to land')
    expect(screen.getByTestId('blank-1')).toHaveValue('27')
  })

  it('starts empty when the question has not been answered before', () => {
    render(<DialogFillInput template={TEMPLATE} onSubmit={vi.fn()} disabled={false} />)
    expect(screen.getByTestId('blank-0')).toHaveValue('')
    expect(screen.getByTestId('blank-1')).toHaveValue('')
  })
})
