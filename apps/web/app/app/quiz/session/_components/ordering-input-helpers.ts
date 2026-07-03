// Pure restore helper for OrderingInput. Hoisted out of ordering-input.tsx to keep
// that component file under the 150-line cap (code-style.md §1) and to keep the
// component render-focused (logic lives elsewhere). Also holds the useOrderingInput
// hook's public opts/result types, moved here to keep the hook file under the 80-line
// hook cap (code-style.md §1) — the runtime logic stays in use-ordering-input.ts.

import type { DragEndEvent, SensorDescriptor, SensorOptions } from '@dnd-kit/core'

export type OrderingItem = { id: string; text: string }

export type UseOrderingInputOpts = {
  /** Items in the server-shuffled delivery order — the student's starting sequence. */
  items: OrderingItem[]
  onSubmit: (order: string[]) => void
  /** Disabled while a session-level submit is in flight. */
  disabled: boolean
  /** True only while this answer is being checked — drives the spinner. */
  submitting: boolean
  /** Whether an answer has been submitted (locks dragging + drives reveal). */
  submitted: boolean
  /** Canonical order (item ids) once submitted, used to mark each slot. */
  correctOrder?: string[]
  /** The student's previously submitted id sequence, used to restore arrangement
   *  on revisit (the runner remounts with `items` back in delivery order). */
  submittedOrder?: string[]
}

export type UseOrderingInputResult = {
  order: OrderingItem[]
  // SensorDescriptor<SensorOptions>[] is exactly what useSensors() returns, kept as a
  // pure type import so this helper file stays hook-free.
  sensors: SensorDescriptor<SensorOptions>[]
  locked: boolean
  graded: boolean
  allCorrect: boolean
  handleDragEnd: (event: DragEndEvent) => void
  handleSubmit: () => void
  slotResult: (index: number) => 'correct' | 'incorrect' | undefined
}

/** Restore the student's submitted sequence (by id) when revisiting an answered
 *  question; otherwise show the delivered order. Falls back to delivery order unless
 *  `submittedOrder` is a full permutation of the delivered items — wrong length, a
 *  duplicate id, or an id that doesn't resolve all void the restore (a tampered or
 *  corrupt persisted order must not render a duplicated row and silently drop an item). */
export function orderFromSubmitted(
  items: OrderingItem[],
  submitted: boolean,
  submittedOrder?: string[],
): OrderingItem[] {
  if (!submitted || !submittedOrder || submittedOrder.length !== items.length) return items
  // A valid restore is a permutation — reject duplicate ids before resolving, so a
  // sequence like ['a','a','b'] falls back to the delivered order instead of mapping
  // the repeated id twice and dropping the missing item.
  if (new Set(submittedOrder).size !== items.length) return items
  const byId = new Map(items.map((it) => [it.id, it]))
  const restored = submittedOrder
    .map((id) => byId.get(id))
    .filter((it): it is OrderingItem => it != null)
  return restored.length === items.length ? restored : items
}
