export type FractionTone = 'all' | 'none' | 'partial'

export function fractionTone(correct: number, total: number): FractionTone {
  if (correct === total && total > 0) return 'all'
  if (correct === 0) return 'none'
  return 'partial'
}

export const FRACTION_TEXT: Record<FractionTone, string> = {
  all: 'text-success',
  none: 'text-danger',
  partial: 'text-muted-foreground',
}
