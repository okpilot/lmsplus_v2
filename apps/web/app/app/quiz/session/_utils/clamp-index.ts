/** Clamp an index to [0, length - 1], returning 0 for empty arrays. */
export function clampIndex(index: number | undefined, length: number): number {
  if (length <= 0) return 0
  return Math.min(Math.max(index ?? 0, 0), length - 1)
}
