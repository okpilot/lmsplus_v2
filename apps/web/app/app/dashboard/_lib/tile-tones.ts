import type { StatusTone } from '@/components/ui/meter'

export const DAILY_GOAL = 50

export function readinessTone(pct: number): StatusTone {
  if (pct >= 71) return 'success'
  if (pct >= 31) return 'caution'
  return 'danger'
}

export const STREAK_TARGET = 7

export function progressTone(value: number, target: number): StatusTone {
  if (value >= target) return 'success'
  if (value > 0) return 'caution'
  return 'danger'
}
