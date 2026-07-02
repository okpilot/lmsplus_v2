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
export function DiagramLabelChip({ id, text, disabled, result }: DiagramLabelChipProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
    disabled,
  })

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : undefined,
  }

  const stateClass =
    result === 'correct'
      ? 'border-emerald-500/60 bg-emerald-500/10'
      : result === 'incorrect'
        ? 'border-destructive/60 bg-destructive/10'
        : 'border-border bg-card'

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
      className={`touch-none cursor-grab rounded-md border px-2 py-1 text-xs font-medium active:cursor-grabbing disabled:cursor-default disabled:opacity-70 ${stateClass}`}
      {...attributes}
      {...listeners}
    >
      {text}
    </button>
  )
}
