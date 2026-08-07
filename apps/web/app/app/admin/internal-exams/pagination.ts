/** Offset-pagination page size for the admin Codes/Attempts tables. */
export const PAGE_SIZE = 25

/**
 * Clamps a page number to a positive integer, defaulting to 1.
 * Rejects undefined, NaN, non-integers, zero, and negatives — Number.isInteger(NaN) and
 * Number.isInteger(2.5) are both false — so a malformed page can't produce invalid
 * .range(from, to) bounds. No upper clamp here: after their count query, callers snap an
 * out-of-range page to the last page with data (effectivePage = Math.min(page, totalPages),
 * #1041) so deep links past the end still return rows.
 */
export function clampPage(page?: number): number {
  if (typeof page !== 'number' || !Number.isInteger(page) || page <= 0) return 1
  return page
}
