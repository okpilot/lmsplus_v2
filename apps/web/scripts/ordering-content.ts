/**
 * Pure validation + composition for authored `ordering` content
 * (scripts/content/*.json). No I/O, no DB, no process state — the importer calls both entry
 * points, and the co-located suite exercises them directly.
 *
 * An authored `ordering` question gives its steps as a plain array of STRINGS in canonical
 * order. It never gives ids: `buildOrderingItems` derives each item's id from the item's own
 * text (see content-ids.ts). An author therefore has no field in which to encode the answer,
 * and the canonical order lives in exactly one place — the array order of the source file.
 *
 * Two entry points with distinct jobs, so an operator reading a failure knows what to fix:
 *   - `assertOrderingItems`  — the authored shape. A failure here means the content is not a
 *                              usable ordering question (not an array, a blank step, out of
 *                              bounds, or two steps that are the same step).
 *   - `buildOrderingItems`   — composition. Turns validated text into the stored
 *                              `{id, text}[]`, preserving canonical order.
 *
 * Bounds are IMPORTED from the app-layer `ordering-validation` module rather than restated, so
 * the authoring gate and the runtime/Zod guards cannot drift apart; that module in turn mirrors
 * the DB CHECK `is_valid_ordering_items`.
 *
 * Keep this file flat in scripts/ — knip's apps/web entry glob is `scripts/*.ts`.
 */

import { MAX_ORDER_ITEMS, MIN_ORDER_ITEMS } from '../app/app/quiz/actions/ordering-validation'
import { requireText } from './content-assertions'
import { assertNoDerivedIdCollisions, deriveContentId, normalizeForId } from './content-ids'

/** Prefix carried by every derived ordering-item id — `o1` followed by 8 hex characters. */
const ORDERING_ID_PREFIX = 'o'

export type OrderingItem = { id: string; text: string }

/**
 * Two steps that normalize to the same string are rejected for two independent reasons, and
 * either alone would be sufficient: they would derive ONE id (so the second item is not
 * separately addressable), and a student reading them sees the same step twice, so no single
 * arrangement is correct — the question has no unique answer to grade against.
 */
function assertItemsDistinct(items: readonly string[], at: string): void {
  const seen = new Map<string, number>()
  for (const [index, text] of items.entries()) {
    const key = normalizeForId(text)
    const prior = seen.get(key)
    if (prior !== undefined) {
      throw new Error(
        `${at}: items[${prior}] and items[${index}] are the same step once case and whitespace are normalized (${JSON.stringify(items[prior])} vs ${JSON.stringify(text)}) — they would derive one id, and no arrangement of the steps would be uniquely correct`,
      )
    }
    seen.set(key, index)
  }
}

/**
 * Structural gate over the authored `items` array. Throws on the first problem, naming the
 * offending index so the operator can find it in the source file.
 */
export function assertOrderingItems(raw: unknown, at: string): asserts raw is string[] {
  if (!Array.isArray(raw)) {
    throw new Error(`${at}: 'items' must be an array (got ${JSON.stringify(raw)})`)
  }
  for (const [index, item] of raw.entries()) {
    requireText(item, `${at}: items[${index}]`)
  }
  if (raw.length < MIN_ORDER_ITEMS || raw.length > MAX_ORDER_ITEMS) {
    throw new Error(
      `${at}: 'items' must hold between ${MIN_ORDER_ITEMS} and ${MAX_ORDER_ITEMS} steps (got ${raw.length})`,
    )
  }
  assertItemsDistinct(raw, at)
}

/**
 * Compose the stored `{id, text}[]`, preserving the authored (canonical) order — the array
 * order IS the answer, so it is never sorted, deduplicated, or otherwise rearranged here.
 *
 * The collision check is not redundant with `assertOrderingItems`'s distinctness check even
 * though the two overlap on the normalization case: this entry point is exported separately
 * and must be self-defending, and only this check can catch a genuine digest collision between
 * two steps whose text really does differ.
 */
export function buildOrderingItems(texts: readonly string[], at: string): OrderingItem[] {
  const items = texts.map((text) => ({ id: deriveContentId(ORDERING_ID_PREFIX, [text]), text }))
  assertNoDerivedIdCollisions(
    items.map((item) => ({ id: item.id, source: item.text })),
    at,
  )
  return items
}
