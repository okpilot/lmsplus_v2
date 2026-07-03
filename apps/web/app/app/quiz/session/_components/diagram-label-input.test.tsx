import type { DragEndEvent } from '@dnd-kit/core'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Capture the DndContext onDragEnd callback so drag tests can fire it directly —
// same jsdom strategy as ordering-input.test.tsx: dnd-kit's coordinate math never
// produces a real drop in jsdom, but direct invocation exercises the same
// production path (handleDragEnd → setPlacement).
const capturedOnDragEnd = vi.hoisted((): { current: ((e: DragEndEvent) => void) | null } => ({
  current: null,
}))
vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/core')>()
  const { DndContext: RealDndContext } = actual
  return {
    ...actual,
    DndContext: ({ onDragEnd, ...rest }: Parameters<typeof actual.DndContext>[0]) => {
      capturedOnDragEnd.current = onDragEnd ?? null
      return <RealDndContext onDragEnd={onDragEnd} {...rest} />
    },
  }
})

vi.mock('./diagrams/registry', () => ({
  getDiagramComponent: vi.fn((imageRef: string) =>
    imageRef === 'known-diagram' ? () => <svg data-testid="diagram-art" /> : null,
  ),
}))

import { DiagramLabelInput } from './diagram-label-input'
import { DIAGRAM_POOL_DROPPABLE_ID } from './diagram-label-input-helpers'

const ZONES = [
  { id: 'z1', x: 0.1, y: 0.1, w: 0.1, h: 0.1 },
  { id: 'z2', x: 0.3, y: 0.3, w: 0.1, h: 0.1 },
]

const LABELS = [
  { id: 'l1', text: 'Upwind' },
  { id: 'l2', text: 'Downwind' },
  { id: 'l3', text: 'Distractor' },
]

function fireDragEnd(activeId: string, overId: string) {
  act(() => {
    capturedOnDragEnd.current?.({
      active: { id: activeId },
      over: { id: overId },
    } as unknown as DragEndEvent)
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  capturedOnDragEnd.current = null
})

describe('DiagramLabelInput', () => {
  it('renders the diagram artwork and a drop zone per delivered zone', () => {
    render(
      <DiagramLabelInput
        imageRef="known-diagram"
        zones={ZONES}
        labels={LABELS}
        onSubmit={vi.fn()}
        disabled={false}
      />,
    )
    expect(screen.getByTestId('diagram-art')).toBeInTheDocument()
    expect(screen.getByTestId('diagram-label-zone-z1')).toBeInTheDocument()
    expect(screen.getByTestId('diagram-label-zone-z2')).toBeInTheDocument()
  })

  it('gives each zone a 1-based positional aria-label reflecting its render order and total zone count', () => {
    render(
      <DiagramLabelInput
        imageRef="known-diagram"
        zones={ZONES}
        labels={LABELS}
        onSubmit={vi.fn()}
        disabled={false}
      />,
    )
    // Production code: ariaLabel={`Drop zone ${i + 1} of ${zones.length}`}
    // ZONES has 2 entries; z1 is at index 0 → "Drop zone 1 of 2", z2 at index 1 → "Drop zone 2 of 2".
    // This guards against off-by-one (i vs i+1) or wrong total (hardcoded vs zones.length).
    expect(screen.getByTestId('diagram-label-zone-z1')).toHaveAttribute(
      'aria-label',
      'Drop zone 1 of 2',
    )
    expect(screen.getByTestId('diagram-label-zone-z2')).toHaveAttribute(
      'aria-label',
      'Drop zone 2 of 2',
    )
  })

  it('shows a fallback message instead of crashing when the image_ref is unknown', () => {
    render(
      <DiagramLabelInput
        imageRef="not-a-real-diagram"
        zones={ZONES}
        labels={LABELS}
        onSubmit={vi.fn()}
        disabled={false}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent(/refresh/i)
    // Fail closed: no drop-zones and no Submit — a student must not be able to
    // answer a diagram they cannot see.
    expect(screen.queryByTestId('diagram-label-zone-z1')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /submit answer/i })).not.toBeInTheDocument()
  })

  it('renders every label as a chip in the pool before any placement', () => {
    render(
      <DiagramLabelInput
        imageRef="known-diagram"
        zones={ZONES}
        labels={LABELS}
        onSubmit={vi.fn()}
        disabled={false}
      />,
    )
    const pool = screen.getByTestId('diagram-label-pool')
    expect(pool).toContainElement(screen.getByTestId('diagram-label-chip-l1'))
    expect(pool).toContainElement(screen.getByTestId('diagram-label-chip-l2'))
    expect(pool).toContainElement(screen.getByTestId('diagram-label-chip-l3'))
  })

  it('places a chip into a zone and removes it from the pool', () => {
    render(
      <DiagramLabelInput
        imageRef="known-diagram"
        zones={ZONES}
        labels={LABELS}
        onSubmit={vi.fn()}
        disabled={false}
      />,
    )
    fireDragEnd('l1', 'z1')
    expect(screen.getByTestId('diagram-label-zone-z1')).toContainElement(
      screen.getByTestId('diagram-label-chip-l1'),
    )
    expect(screen.getByTestId('diagram-label-pool')).not.toContainElement(
      screen.queryByTestId('diagram-label-chip-l1'),
    )
  })

  it('moves a placed chip to a new zone when dropped there', () => {
    render(
      <DiagramLabelInput
        imageRef="known-diagram"
        zones={ZONES}
        labels={LABELS}
        onSubmit={vi.fn()}
        disabled={false}
      />,
    )
    fireDragEnd('l1', 'z1')
    fireDragEnd('l1', 'z2')
    expect(screen.getByTestId('diagram-label-zone-z1')).not.toContainElement(
      screen.queryByTestId('diagram-label-chip-l1'),
    )
    expect(screen.getByTestId('diagram-label-zone-z2')).toContainElement(
      screen.getByTestId('diagram-label-chip-l1'),
    )
  })

  it('replaces the occupant of a zone, returning the displaced chip to the pool', () => {
    render(
      <DiagramLabelInput
        imageRef="known-diagram"
        zones={ZONES}
        labels={LABELS}
        onSubmit={vi.fn()}
        disabled={false}
      />,
    )
    fireDragEnd('l1', 'z1')
    fireDragEnd('l2', 'z1')
    expect(screen.getByTestId('diagram-label-zone-z1')).toContainElement(
      screen.getByTestId('diagram-label-chip-l2'),
    )
    expect(screen.getByTestId('diagram-label-pool')).toContainElement(
      screen.getByTestId('diagram-label-chip-l1'),
    )
  })

  it('unplaces a chip when dropped back onto the pool', () => {
    render(
      <DiagramLabelInput
        imageRef="known-diagram"
        zones={ZONES}
        labels={LABELS}
        onSubmit={vi.fn()}
        disabled={false}
      />,
    )
    fireDragEnd('l1', 'z1')
    fireDragEnd('l1', DIAGRAM_POOL_DROPPABLE_ID)
    expect(screen.getByTestId('diagram-label-pool')).toContainElement(
      screen.getByTestId('diagram-label-chip-l1'),
    )
  })

  it('submits the current placement as zoneId/labelId pairs', async () => {
    const onSubmit = vi.fn()
    render(
      <DiagramLabelInput
        imageRef="known-diagram"
        zones={ZONES}
        labels={LABELS}
        onSubmit={onSubmit}
        disabled={false}
      />,
    )
    fireDragEnd('l1', 'z1')
    await userEvent.click(screen.getByRole('button', { name: /submit answer/i }))
    expect(onSubmit).toHaveBeenCalledWith([{ zoneId: 'z1', labelId: 'l1' }])
  })

  it('submits an empty mapping when nothing was placed', async () => {
    const onSubmit = vi.fn()
    render(
      <DiagramLabelInput
        imageRef="known-diagram"
        zones={ZONES}
        labels={LABELS}
        onSubmit={onSubmit}
        disabled={false}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /submit answer/i }))
    expect(onSubmit).toHaveBeenCalledWith([])
  })

  it('shows a spinner and disables Submit while the answer is being checked', () => {
    render(
      <DiagramLabelInput
        imageRef="known-diagram"
        zones={ZONES}
        labels={LABELS}
        onSubmit={vi.fn()}
        disabled={false}
        submitting
      />,
    )
    const button = screen.getByRole('button', { name: /submit answer/i })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button.querySelector('.animate-spin')).not.toBeNull()
  })

  it('ignores a drop while the answer is being checked', () => {
    render(
      <DiagramLabelInput
        imageRef="known-diagram"
        zones={ZONES}
        labels={LABELS}
        onSubmit={vi.fn()}
        disabled={false}
        submitting
      />,
    )
    fireDragEnd('l1', 'z1')
    expect(screen.getByTestId('diagram-label-pool')).toContainElement(
      screen.getByTestId('diagram-label-chip-l1'),
    )
  })

  it('hides Submit and the pool once submitted', () => {
    render(
      <DiagramLabelInput
        imageRef="known-diagram"
        zones={ZONES}
        labels={LABELS}
        onSubmit={vi.fn()}
        disabled={false}
        submitted
      />,
    )
    expect(screen.queryByRole('button', { name: /submit answer/i })).not.toBeInTheDocument()
    expect(screen.queryByTestId('diagram-label-pool')).not.toBeInTheDocument()
  })

  it('restores the student submitted placement when revisiting an answered question', () => {
    render(
      <DiagramLabelInput
        imageRef="known-diagram"
        zones={ZONES}
        labels={LABELS}
        onSubmit={vi.fn()}
        disabled={false}
        submitted
        submittedMapping={[{ zoneId: 'z1', labelId: 'l1' }]}
      />,
    )
    expect(screen.getByTestId('diagram-label-zone-z1')).toContainElement(
      screen.getByTestId('diagram-label-chip-l1'),
    )
  })

  it('marks each zone correct or incorrect against the canonical mapping after submit', () => {
    render(
      <DiagramLabelInput
        imageRef="known-diagram"
        zones={ZONES}
        labels={LABELS}
        onSubmit={vi.fn()}
        disabled={false}
        submitted
        submittedMapping={[
          { zoneId: 'z1', labelId: 'l1' },
          { zoneId: 'z2', labelId: 'l3' },
        ]}
        correctMapping={[
          { zoneId: 'z1', labelId: 'l1' },
          { zoneId: 'z2', labelId: 'l2' },
        ]}
      />,
    )
    expect(screen.getByTestId('diagram-label-zone-z1')).toHaveAttribute('data-result', 'correct')
    expect(screen.getByTestId('diagram-label-zone-z2')).toHaveAttribute('data-result', 'incorrect')
  })

  it('reveals the canonical label text for a wrong zone', () => {
    render(
      <DiagramLabelInput
        imageRef="known-diagram"
        zones={ZONES}
        labels={LABELS}
        onSubmit={vi.fn()}
        disabled={false}
        submitted
        submittedMapping={[{ zoneId: 'z2', labelId: 'l1' }]}
        correctMapping={[
          { zoneId: 'z1', labelId: 'l1' },
          { zoneId: 'z2', labelId: 'l2' },
        ]}
      />,
    )
    expect(screen.getByTestId('diagram-label-canonical-z2')).toHaveTextContent('Downwind')
  })

  it('announces a correct result to screen readers when every zone matches', () => {
    render(
      <DiagramLabelInput
        imageRef="known-diagram"
        zones={ZONES}
        labels={LABELS}
        onSubmit={vi.fn()}
        disabled={false}
        submitted
        submittedMapping={[
          { zoneId: 'z1', labelId: 'l1' },
          { zoneId: 'z2', labelId: 'l2' },
        ]}
        correctMapping={[
          { zoneId: 'z1', labelId: 'l1' },
          { zoneId: 'z2', labelId: 'l2' },
        ]}
      />,
    )
    const liveRegion = screen.getByTestId('diagram-label-result')
    expect(liveRegion).toHaveAttribute('role', 'status')
    expect(liveRegion).toHaveAttribute('aria-live', 'polite')
    expect(liveRegion).toHaveTextContent('Correct')
  })

  it('announces an incorrect result to screen readers when any zone is wrong', () => {
    render(
      <DiagramLabelInput
        imageRef="known-diagram"
        zones={ZONES}
        labels={LABELS}
        onSubmit={vi.fn()}
        disabled={false}
        submitted
        submittedMapping={[{ zoneId: 'z1', labelId: 'l2' }]}
        correctMapping={[
          { zoneId: 'z1', labelId: 'l1' },
          { zoneId: 'z2', labelId: 'l2' },
        ]}
      />,
    )
    const liveRegion = screen.getByTestId('diagram-label-result')
    expect(liveRegion).toHaveTextContent('Incorrect')
  })

  it('does not announce a result before grading data arrives', () => {
    render(
      <DiagramLabelInput
        imageRef="known-diagram"
        zones={ZONES}
        labels={LABELS}
        onSubmit={vi.fn()}
        disabled={false}
        submitted
      />,
    )
    expect(screen.queryByTestId('diagram-label-result')).not.toBeInTheDocument()
  })
})
