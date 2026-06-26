// Pure restore helper for OrderingInput. Hoisted out of ordering-input.tsx to keep
// that component file under the 150-line cap (code-style.md §1) and to keep the
// component render-focused (logic lives elsewhere).

export type OrderingItem = { id: string; text: string }

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
