'use client'

import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'

type DiagramLabelChipProps = Readonly<{
  id: string
  text: string
  /** Drag disabled once submitted, while a session submit is in flight, or per-check. */
  disabled: boolean
  /** Post-submit per-chip grading state, mirrored from the zone it occupies. */
  result?: 'correct' | 'incorrect'
}>

/** A single draggable label chip — rendered both in the pool and inside an
 *  occupied zone (dragging a placed chip moves it; see DiagramLabelInput). */
export function DiagramLabelChip({ id, text, disabled, result }: Readonly<DiagramLabelChipProps>) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
    disabled,
  })

  const style = {
    transform: CSS.Translate.toString(transform),
  }

  const stateClass =
    result === 'correct'
      ? 'border-success bg-card'
      : result === 'incorrect'
        ? 'border-danger bg-card'
        : 'border-input bg-card'

  const liftClass = isDragging ? 'relative z-10 border-primary shadow-raised' : ''

  return (
    <button
      type="button"
      ref={setNodeRef}
      style={style}
      disabled={disabled}
      data-testid={`diagram-label-chip-${id}`}
      data-result={result ?? ''}
      // Announce the graded state to screen readers / colorblind users — the
      // border colour + data-result attribute alone are not accessible.
      aria-label={result ? `${text}, ${result}` : text}
      className={`h-7 max-w-full touch-none cursor-grab truncate whitespace-nowrap rounded-inner border px-2 text-caption active:cursor-grabbing disabled:cursor-not-allowed ${result ? '' : 'disabled:opacity-50'} ${stateClass} ${liftClass}`}
      {...attributes}
      {...listeners}
    >
      {text}
    </button>
  )
}
