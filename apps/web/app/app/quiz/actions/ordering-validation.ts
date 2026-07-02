/**
 * Shared ordering-question validation constants and helpers.
 *
 * The DB CHECK `is_valid_ordering_items` (mig 143) is the authoritative server
 * guard; this module is client/app-layer dedup only — keeping bounds and
 * permutation logic in one place so the Zod schemas, runtime validators, and
 * query helpers stay in sync without hand-maintained parity comments.
 */

export const MIN_ORDER_ITEMS = 2

export const MAX_ORDER_ITEMS = 50

/**
 * Returns true when every id in the array is distinct (no duplicates).
 * An ordering answer is a permutation, so each item id must appear exactly once.
 */
export function isUniquePermutation(ids: string[]): boolean {
  return new Set(ids).size === ids.length
}
