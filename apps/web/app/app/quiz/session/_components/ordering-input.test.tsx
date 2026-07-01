import type { DragEndEvent } from '@dnd-kit/core'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OrderingInput } from './ordering-input'

// Capture the DndContext onDragEnd callback so the reorder test can fire it directly.
// jsdom limitation: dnd-kit's sortableKeyboardCoordinates reads droppableRects for
// collision detection. droppableRects is populated via a WhileDragging useEffect but
// its results feed into an internal translate/collision pipeline that does not produce
// a reorder in jsdom even when getBoundingClientRect is spied to return real values —
// the coordinate math diverges from a live browser because CSS transforms don't move
// elements in jsdom. Direct onDragEnd invocation exercises the same production code
// path (handleDragEnd → setOrder → arrayMove) and is the correct jsdom strategy.
const capturedOnDragEnd = vi.hoisted((): { current: ((e: DragEndEvent) => void) | null } => ({
  current: null,
}))
vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/core')>()
  const { DndContext: RealDndContext } = actual
  return {
    ...actual,
    DndContext: ({ onDragEnd, ...rest }: Parameters<typeof actual.DndContext>[0]) => {
      // Capture the latest onDragEnd so the reorder test can call it directly.
      capturedOnDragEnd.current = onDragEnd ?? null
      return <RealDndContext onDragEnd={onDragEnd} {...rest} />
    },
  }
})

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
    // Assert the spinner is actually rendered, not just the busy state — otherwise
    // the spinner could regress away and this test would still pass on aria-busy alone.
    expect(button.querySelector('.animate-spin')).not.toBeNull()
  })

  it('removes drag handles while the answer is being checked so the student cannot reorder mid-check', () => {
    render(<OrderingInput items={ITEMS} onSubmit={vi.fn()} disabled={false} submitting />)
    // The Submit button is still present (just disabled) — only the drag handles disappear.
    expect(screen.queryByRole('button', { name: /reorder/i })).not.toBeInTheDocument()
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
    const liveRegion = screen.getByTestId('ordering-result')
    // The screen-reader announcement contract: a polite live status region carrying
    // the result text. Asserting the attributes (not just the text) keeps the test
    // honest if the aria-live/role announcement is ever dropped.
    expect(liveRegion).toHaveAttribute('role', 'status')
    expect(liveRegion).toHaveAttribute('aria-live', 'polite')
    expect(liveRegion).toHaveTextContent('Correct')
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
    const liveRegion = screen.getByTestId('ordering-result')
    expect(liveRegion).toHaveAttribute('role', 'status')
    expect(liveRegion).toHaveAttribute('aria-live', 'polite')
    expect(liveRegion).toHaveTextContent('Incorrect')
  })

  it('does not announce a result before grading data arrives', () => {
    render(<OrderingInput items={ITEMS} onSubmit={vi.fn()} disabled={false} submitted />)
    expect(screen.queryByTestId('ordering-result')).not.toBeInTheDocument()
  })

  it('submits the new item sequence after the first item is dragged down one slot', async () => {
    // Fires onDragEnd directly via the capturedOnDragEnd ref rather than through the
    // keyboard sensor. dnd-kit's coordinate math (WhileDragging measurement → translate
    // → collision detection) does not produce a move in jsdom even when
    // getBoundingClientRect is spied to return real y-values — confirmed by measurement
    // logs showing all three items ARE measured but ArrowDown still yields no over change.
    // Direct invocation exercises the same production path: handleDragEnd → setOrder →
    // arrayMove → the updated order is forwarded by onSubmit.
    const onSubmit = vi.fn()
    render(<OrderingInput items={ITEMS} onSubmit={onSubmit} disabled={false} />)

    // Simulate: user dragged mayday (slot 0) onto callsign (slot 1) and released.
    act(() => {
      capturedOnDragEnd.current?.({
        active: { id: 'mayday' },
        over: { id: 'callsign' },
      } as unknown as DragEndEvent)
    })

    await userEvent.click(screen.getByRole('button', { name: /submit answer/i }))
    // mayday moved from slot 0 to slot 1 → [callsign, mayday, nature]
    expect(onSubmit).toHaveBeenCalledWith(['callsign', 'mayday', 'nature'])
  })

  it('keeps the sequence unchanged when a drop lands after a session submit starts', () => {
    // A drop that resolves after the parent flips `disabled` (session submit in flight)
    // must not mutate the displayed order — otherwise the arrangement would diverge from
    // what the server graded. Fires onDragEnd directly (same jsdom strategy as above).
    const onSubmit = vi.fn()
    const { rerender } = render(
      <OrderingInput items={ITEMS} onSubmit={onSubmit} disabled={false} />,
    )
    rerender(<OrderingInput items={ITEMS} onSubmit={onSubmit} disabled />)

    act(() => {
      capturedOnDragEnd.current?.({
        active: { id: 'mayday' },
        over: { id: 'callsign' },
      } as unknown as DragEndEvent)
    })

    const rendered = screen
      .getAllByTestId(/^ordering-item-/)
      .map((el) => el.getAttribute('data-testid'))
    expect(rendered).toEqual([
      'ordering-item-mayday',
      'ordering-item-callsign',
      'ordering-item-nature',
    ])
  })

  it('keeps the sequence unchanged when a drop lands after a submit is in flight', () => {
    // The guard is `locked || disabled || submitting`; the disabled test above would stay
    // green even if `submitting` were dropped from it. This pins the `submitting` branch
    // directly — the production race is a TouchSensor drop resolving after submit starts.
    const onSubmit = vi.fn()
    const { rerender } = render(
      <OrderingInput items={ITEMS} onSubmit={onSubmit} disabled={false} />,
    )
    rerender(<OrderingInput items={ITEMS} onSubmit={onSubmit} disabled={false} submitting />)

    act(() => {
      capturedOnDragEnd.current?.({
        active: { id: 'mayday' },
        over: { id: 'callsign' },
      } as unknown as DragEndEvent)
    })

    const rendered = screen
      .getAllByTestId(/^ordering-item-/)
      .map((el) => el.getAttribute('data-testid'))
    expect(rendered).toEqual([
      'ordering-item-mayday',
      'ordering-item-callsign',
      'ordering-item-nature',
    ])
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
