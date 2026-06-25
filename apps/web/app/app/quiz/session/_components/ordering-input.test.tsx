import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OrderingInput } from './ordering-input'

const ITEMS = [
  { id: 'mayday', text: 'MAYDAY MAYDAY MAYDAY' },
  { id: 'callsign', text: 'Speedbird 123' },
  { id: 'nature', text: 'engine failure' },
]

beforeEach(() => {
  vi.resetAllMocks()
})

describe('OrderingInput', () => {
  it('renders one row per item in the delivered order', () => {
    render(<OrderingInput items={ITEMS} onSubmit={vi.fn()} disabled={false} />)
    expect(screen.getByTestId('ordering-item-mayday')).toHaveTextContent('MAYDAY MAYDAY MAYDAY')
    expect(screen.getByTestId('ordering-item-callsign')).toHaveTextContent('Speedbird 123')
    expect(screen.getByTestId('ordering-item-nature')).toHaveTextContent('engine failure')
  })

  it('submits the current item ids in their displayed order', async () => {
    const onSubmit = vi.fn()
    render(<OrderingInput items={ITEMS} onSubmit={onSubmit} disabled={false} />)
    await userEvent.click(screen.getByRole('button', { name: /submit answer/i }))
    expect(onSubmit).toHaveBeenCalledWith(['mayday', 'callsign', 'nature'])
  })

  it('shows a spinner and disables Submit while the answer is being checked', () => {
    render(<OrderingInput items={ITEMS} onSubmit={vi.fn()} disabled={false} submitting />)
    const button = screen.getByRole('button', { name: /submit answer/i })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
  })

  it('hides Submit and removes drag handles once submitted', () => {
    render(<OrderingInput items={ITEMS} onSubmit={vi.fn()} disabled={false} submitted />)
    expect(screen.queryByRole('button', { name: /submit answer/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /reorder/i })).not.toBeInTheDocument()
  })

  it('marks each slot correct or incorrect against the canonical order after submit', () => {
    // Student order = ITEMS (mayday, callsign, nature). Canonical swaps the last two,
    // so slot 0 matches, slots 1 and 2 do not.
    render(
      <OrderingInput
        items={ITEMS}
        onSubmit={vi.fn()}
        disabled={false}
        submitted
        correctOrder={['mayday', 'nature', 'callsign']}
      />,
    )
    expect(screen.getByTestId('ordering-item-mayday')).toHaveAttribute('data-result', 'correct')
    expect(screen.getByTestId('ordering-item-callsign')).toHaveAttribute('data-result', 'incorrect')
    expect(screen.getByTestId('ordering-item-nature')).toHaveAttribute('data-result', 'incorrect')
  })

  it('reveals the canonical text for a wrong slot', () => {
    render(
      <OrderingInput
        items={ITEMS}
        onSubmit={vi.fn()}
        disabled={false}
        submitted
        correctOrder={['mayday', 'nature', 'callsign']}
      />,
    )
    // slot 1 (callsign) is wrong — its canonical is revealed
    expect(screen.getByTestId('ordering-canonical-callsign')).toHaveTextContent('engine failure')
    // slot 0 (mayday) is correct — no canonical reveal
    expect(screen.queryByTestId('ordering-canonical-mayday')).not.toBeInTheDocument()
  })

  it('announces a correct result to screen readers when every slot matches', () => {
    render(
      <OrderingInput
        items={ITEMS}
        onSubmit={vi.fn()}
        disabled={false}
        submitted
        correctOrder={['mayday', 'callsign', 'nature']}
      />,
    )
    expect(screen.getByTestId('ordering-result')).toHaveTextContent('Correct')
  })

  it('announces an incorrect result to screen readers when any slot is wrong', () => {
    render(
      <OrderingInput
        items={ITEMS}
        onSubmit={vi.fn()}
        disabled={false}
        submitted
        correctOrder={['mayday', 'nature', 'callsign']}
      />,
    )
    expect(screen.getByTestId('ordering-result')).toHaveTextContent('Incorrect')
  })

  it('does not announce a result before grading data arrives', () => {
    render(<OrderingInput items={ITEMS} onSubmit={vi.fn()} disabled={false} submitted />)
    expect(screen.queryByTestId('ordering-result')).not.toBeInTheDocument()
  })

  it('restores the student submitted sequence when revisiting an answered question', () => {
    // On revisit the runner remounts with `items` in delivery (shuffled) order. The
    // component must render the student's prior arrangement (submittedOrder) so the
    // per-slot badges line up against the items the student actually placed.
    render(
      <OrderingInput
        items={ITEMS}
        onSubmit={vi.fn()}
        disabled={false}
        submitted
        submittedOrder={['nature', 'mayday', 'callsign']}
        correctOrder={['nature', 'mayday', 'callsign']}
      />,
    )
    const rendered = screen
      .getAllByTestId(/^ordering-item-/)
      .map((el) => el.getAttribute('data-testid'))
    expect(rendered).toEqual([
      'ordering-item-nature',
      'ordering-item-mayday',
      'ordering-item-callsign',
    ])
    // submittedOrder matches correctOrder → every slot is marked correct.
    for (const id of ['nature', 'mayday', 'callsign']) {
      expect(screen.getByTestId(`ordering-item-${id}`)).toHaveAttribute('data-result', 'correct')
    }
  })
})
