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
})
