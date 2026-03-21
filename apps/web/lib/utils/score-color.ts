/** Color-code a quiz score percentage using EASA PPL pass-mark thresholds. */
export function scoreColor(pct: number): string {
  // 70% = EASA PPL pass mark — thresholds use raw value, not rounded
  if (pct >= 70) return '#22C55E' // green
  if (pct >= 50) return '#F59E0B' // amber
  return '#EF4444' // red
}
