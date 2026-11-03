export const MASTERY_GOAL = 90

export function atGoal(value: number, target: number = MASTERY_GOAL): boolean {
  return Math.round(value) >= target
}

export function masteryMeterTone(pct: number): 'goal' | 'data' {
  return atGoal(pct) ? 'goal' : 'data'
}

export function masteryTextClass(pct: number): 'text-success' | 'text-muted-foreground' {
  return atGoal(pct) ? 'text-success' : 'text-muted-foreground'
}

export function goalMeterTone(value: number, target: number): 'goal' | 'data' {
  return atGoal(value, target) ? 'goal' : 'data'
}
