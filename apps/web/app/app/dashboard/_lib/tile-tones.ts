export type TileTone = 'success' | 'caution' | 'danger'

export const DAILY_GOAL = 50

export function readinessTone(pct: number): TileTone {
  if (pct >= 71) return 'success'
  if (pct >= 31) return 'caution'
  return 'danger'
}

export function goalTone(questionsToday: number): TileTone {
  if (questionsToday >= DAILY_GOAL) return 'success'
  if (questionsToday > 0) return 'caution'
  return 'danger'
}

export function streakTone(days: number): TileTone {
  if (days >= 7) return 'success'
  if (days > 0) return 'caution'
  return 'danger'
}
