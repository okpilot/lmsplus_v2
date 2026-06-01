export const DEFAULT_LIMIT = 50
export const MAX_LIMIT = 200

export function clampLimit(limit?: number): number {
  if (typeof limit !== 'number' || limit <= 0) return DEFAULT_LIMIT
  return Math.min(limit, MAX_LIMIT)
}
