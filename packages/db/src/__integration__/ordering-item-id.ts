// Derived ordering-item id helper for packages/db integration fixtures (#1045).
//
// Mirrors apps/web/scripts/content-ids.ts `deriveContentId('o', [text])` byte-for-byte (same
// ID_VERSION '1', same DIGEST_CHARS 8, same normalize: trim, collapse internal whitespace runs to
// one space, lowercase) and the SQL function `ordering_item_id(text)` added by migration
// 20260928000100_ordering_items_derived_ids.sql, which the `questions_question_type_columns_check`
// CHECK now enforces via `is_valid_ordering_items`. A fixture built with a hand id (or the OLD
// semantic-code ids this test suite used before #1045) is now rejected at INSERT with 23514.
//
// A separate implementation, not an import of content-ids.ts: packages/db does not depend on
// apps/web (layering), and these tests build fixture rows as plain JS objects with no DB round
// trip, so a local node:crypto helper matches how the suite already constructs rows — the same
// choice content-ids.ts itself makes for the app-layer parity test
// (apps/web/scripts/content-ids.integration.test.ts) on the OTHER side of this contract.
import { createHash } from 'node:crypto'

/** Must match apps/web/scripts/content-ids.ts `normalizeForId` exactly. */
function normalizeForId(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * The derived id for an ordering_items element's `id` field, given its `text`.
 *
 * `'o1' || first 8 hex chars of sha256(utf8(normalizeForId(text)))` — matches
 * `deriveContentId('o', [text])` and the SQL `ordering_item_id(text)` function.
 */
export function orderingItemId(text: string): string {
  const digest = createHash('sha256').update(normalizeForId(text), 'utf8').digest('hex')
  return `o1${digest.slice(0, 8)}`
}

/** Build an `{ id, text }` ordering_items element with a correctly derived id. */
export function orderingItem(text: string): { id: string; text: string } {
  return { id: orderingItemId(text), text }
}
