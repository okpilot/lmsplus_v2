/**
 * Formats a millisecond duration as a human-readable `h`/`m`/`s` breakdown.
 * Whole seconds only (rounded), matching the session-total formatter.
 * Shared by `result-summary` (session total) and `report-question-row`
 * (per-question response time) so both render durations identically.
 *
 * Examples: 35_000 → "35s", 60_000 → "1m 0s", 95_300 → "1m 35s",
 * 3_725_000 → "1h 2m 5s".
 */
export function formatMsDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
  if (minutes === 0) return `${seconds}s`
  return `${minutes}m ${seconds}s`
}
