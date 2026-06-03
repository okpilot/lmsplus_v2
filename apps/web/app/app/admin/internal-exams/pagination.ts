export const DEFAULT_LIMIT = 50
export const MAX_LIMIT = 200

export function clampLimit(limit?: number): number {
  // Reject NaN and non-integers too — Number.isInteger(NaN) and Number.isInteger(5.5) are
  // both false, so a malformed limit falls back to DEFAULT instead of leaking NaN downstream.
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit <= 0) return DEFAULT_LIMIT
  return Math.min(limit, MAX_LIMIT)
}
