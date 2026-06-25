'use client'

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { OrderingInputItem } from './ordering-input-item'

type OrderingItem = { id: string; text: string }

type OrderingInputProps = {
  /** Items in the server-shuffled delivery order — the student's starting sequence. */
  items: OrderingItem[]
  onSubmit: (order: string[]) => void
  /** Disabled while a session-level submit is in flight. */
  disabled: boolean
  /** True only while this answer is being checked — drives the spinner. */
  submitting?: boolean
  /** Whether an answer has been submitted (locks dragging + drives reveal). */
  submitted?: boolean
  /** Canonical order (item ids) once submitted, used to mark each slot. Ids are
   *  compared (unambiguous); the correct item's display text is resolved locally
   *  from `items`. */
  correctOrder?: string[]
  /** The student's previously submitted id sequence. On revisiting an answered
   *  question the runner remounts with `items` in delivery (shuffled) order; this
   *  restores the student's arrangement so the per-slot badges align correctly. */
  submittedOrder?: string[]
}

/** Restore the student's submitted sequence (by id) when revisiting an answered
 *  question; otherwise show the delivered order. Falls back to delivery order if the
 *  submitted ids don't fully resolve against the delivered items. */
function orderFromSubmitted(
  items: OrderingItem[],
  submitted: boolean,
  submittedOrder?: string[],
): OrderingItem[] {
  if (!submitted || !submittedOrder || submittedOrder.length !== items.length) return items
  const byId = new Map(items.map((it) => [it.id, it]))
  const restored = submittedOrder
    .map((id) => byId.get(id))
    .filter((it): it is OrderingItem => it != null)
  return restored.length === items.length ? restored : items
}

export function OrderingInput({
  items,
  onSubmit,
  disabled,
  submitting = false,
  submitted = false,
  correctOrder,
  submittedOrder,
}: OrderingInputProps) {
  const [order, setOrder] = useState<OrderingItem[]>(() =>
    orderFromSubmitted(items, submitted, submittedOrder),
  )

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const locked = submitted
  const graded = locked && correctOrder != null
  // Compare by id (the grader reveals canonical ids); map ids back to display text.
  const idToText = new Map(items.map((it) => [it.id, it.text]))
  const allCorrect = graded && order.every((it, i) => it.id === correctOrder[i])

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setOrder((prev) => {
      const from = prev.findIndex((it) => it.id === active.id)
      const to = prev.findIndex((it) => it.id === over.id)
      if (from === -1 || to === -1) return prev
      return arrayMove(prev, from, to)
    })
  }

  function handleSubmit() {
    onSubmit(order.map((it) => it.id))
  }

  function slotResult(index: number): 'correct' | 'incorrect' | undefined {
    if (!graded) return undefined
    return order[index]?.id === correctOrder[index] ? 'correct' : 'incorrect'
  }

  return (
    <div className="space-y-3">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={order.map((it) => it.id)} strategy={verticalListSortingStrategy}>
          <ol className="space-y-2">
            {order.map((it, i) => (
              <OrderingInputItem
                key={it.id}
                id={it.id}
                text={it.text}
                // Also lock during `submitting`: reordering mid-check would make the
                // post-result badges (slotResult/canonical) compare a sequence the
                // server never graded, so the reveal would disagree with is_correct.
                disabled={locked || disabled || submitting}
                result={slotResult(i)}
                canonical={graded ? idToText.get(correctOrder[i] ?? '') : undefined}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>

      {graded && (
        <p data-testid="ordering-result" role="status" aria-live="polite" className="sr-only">
          {allCorrect ? 'Correct' : 'Incorrect'}
        </p>
      )}

      {!locked && (
        <button
          type="button"
          disabled={disabled || submitting}
          aria-busy={submitting || undefined}
          onClick={handleSubmit}
          className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          <span className="inline-flex items-center justify-center gap-2">
            {submitting && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
            Submit Answer
          </span>
        </button>
      )}
    </div>
  )
}
