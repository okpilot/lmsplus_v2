/** Color-code a quiz score percentage using EASA PPL pass-mark thresholds. */
export function scoreColor(pct: number): string {
  // 70% = EASA PPL pass mark — thresholds use raw value, not rounded
  if (pct >= 70) return 'var(--success-solid)'
  if (pct >= 50) return 'var(--caution-solid)'
  return 'var(--danger-solid)'
}
