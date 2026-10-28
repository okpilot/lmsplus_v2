import { MASTERY_GOAL } from '@/lib/utils/mastery-tone'

export const DAILY_GOAL = 50

export function readinessTone(pct: number): 'success' | undefined {
  return pct >= MASTERY_GOAL ? 'success' : undefined
}

export const STREAK_TARGET = 7

export function progressTone(value: number, target: number): 'success' | undefined {
  return value >= target ? 'success' : undefined
}
