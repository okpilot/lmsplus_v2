import { atGoal } from '@/lib/utils/mastery-tone'

export const DAILY_GOAL = 50

export function readinessTone(pct: number): 'success' | undefined {
  return atGoal(pct) ? 'success' : undefined
}

export const STREAK_TARGET = 7

export function progressTone(value: number, target: number): 'success' | undefined {
  return atGoal(value, target) ? 'success' : undefined
}

export function readinessPct(readyCount: number, totalCount: number): number {
  return totalCount > 0 ? Math.round((readyCount / totalCount) * 100) : 0
}

export function dailyGoalProgress(questionsToday: number): { progress: number; remaining: number } {
  return {
    progress: Math.min(Math.round((questionsToday / DAILY_GOAL) * 100), 100),
    remaining: Math.max(DAILY_GOAL - questionsToday, 0),
  }
}
