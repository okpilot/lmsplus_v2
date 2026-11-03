/** Color-code a quiz score percentage using EASA PPL pass-mark thresholds. */
export function scoreColor(pct: number, shade: 'text' | 'solid' = 'text'): string {
  const suffix = shade === 'solid' ? '-solid' : ''
  // 70% = EASA PPL pass mark — thresholds use raw value, not rounded
  if (pct >= 70) return `var(--success${suffix})`
  if (pct >= 50) return `var(--caution${suffix})`
  return `var(--danger${suffix})`
}
