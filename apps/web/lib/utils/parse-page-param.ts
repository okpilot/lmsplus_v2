/**
 * Parses a URL search parameter value into a positive integer page number.
 * Returns 1 for any invalid input (non-string, non-integer, zero, negative, or NaN).
 */
export function parsePageParam(value: string | string[] | undefined): number {
  if (typeof value !== 'string') return 1
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) && n >= 1 ? n : 1
}
