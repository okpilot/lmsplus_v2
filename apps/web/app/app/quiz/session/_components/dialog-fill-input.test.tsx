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
