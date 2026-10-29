import { atGoal } from '@/lib/utils/mastery-tone'

export const DAILY_GOAL = 50

export function readinessTone(pct: number): 'success' | undefined {
  return atGoal(pct) ? 'success' : undefined
}

export const STREAK_TARGET = 7

export function progressTone(value: number, target: number): 'success' | undefined {
  return atGoal(value, target) ? 'success' : undefined
}
