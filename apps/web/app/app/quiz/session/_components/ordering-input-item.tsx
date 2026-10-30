'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'

type OrderingInputItemProps = Readonly<{
  id: string
  text: string
  /** Drag/keyboard reordering disabled once submitted or while a session submit is in flight. */
  disabled: boolean
  /** Post-submit per-slot grading state. Undefined while unsubmitted. */
  result?: 'correct' | 'incorrect'
  /** The canonical item text for this slot, revealed when the slot is wrong. */
  canonical?: string
}>

export function OrderingInputItem({
  id,
  text,
  disabled,
  result,
  canonical,
}: Readonly<OrderingInputItemProps>) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id,
    disabled,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const stateClass =
    result === 'correct'
      ? 'border-success bg-card'
      : result === 'incorrect'
        ? 'border-danger bg-card'
        : cn('border-input bg-card', !disabled && 'hover:bg-muted')

  const liftClass = isDragging ? 'relative z-sticky border-primary shadow-raised' : ''

  return (
    <li
      ref={setNodeRef}
      style={style}
      data-testid={`ordering-item-${id}`}
      data-result={result ?? ''}
      className={cn(
        'flex items-center gap-3 rounded-control border p-3 text-body',
        stateClass,
        liftClass,
      )}
    >
      {!disabled && (
        <button
          type="button"
          ref={setActivatorNodeRef}
          aria-label={`Reorder ${text}`}
          className="cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical aria-hidden="true" className="size-icon" />
        </button>
      )}
      <span className="flex-1">{text}</span>
      {result === 'incorrect' && canonical && (
        <span
          data-testid={`ordering-canonical-${id}`}
          className="text-caption font-medium text-muted-foreground"
        >
          {canonical}
        </span>
      )}
    </li>
  )
}
