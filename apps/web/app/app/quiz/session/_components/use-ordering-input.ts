'use client'

import {
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { useState } from 'react'
import {
  type OrderingItem,
  orderFromSubmitted,
  type UseOrderingInputOpts,
  type UseOrderingInputResult,
} from './ordering-input-helpers'

export type { UseOrderingInputOpts, UseOrderingInputResult }

// Owns the ordering-input's drag state + interaction logic so the component stays
// render-focused (code-style.md §2 — no business logic in components).
export function useOrderingInput(opts: Readonly<UseOrderingInputOpts>): UseOrderingInputResult {
  const { items, onSubmit, disabled, submitting, submitted, correctOrder, submittedOrder } = opts
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
  // Compare by id (the grader reveals canonical ids).
  const allCorrect = graded && order.every((it, i) => it.id === correctOrder[i])

  function handleDragEnd(event: DragEndEvent) {
    // Defense-in-depth: a touch begun before the RPC resolved can still fire
    // onDragEnd after `submitting` flips true (TouchSensor has a 250ms activation
    // delay), so ignore drops once locked or mid-check — the displayed order must
    // not diverge from the sequence the server actually graded. Also bail when the
    // parent flips `disabled` (session submit in flight) mid-drag — same freeze
    // intent as the item-level `disabled` on OrderingInputItem.
    if (locked || disabled || submitting) return
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

  return { order, sensors, locked, graded, allCorrect, handleDragEnd, handleSubmit, slotResult }
}
