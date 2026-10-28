export const MASTERY_GOAL = 90

export function masteryMeterTone(pct: number): 'goal' | 'data' {
  return pct >= MASTERY_GOAL ? 'goal' : 'data'
}

export function masteryTextClass(pct: number): 'text-success' | 'text-muted-foreground' {
  return pct >= MASTERY_GOAL ? 'text-success' : 'text-muted-foreground'
}

export function goalMeterTone(value: number, target: number): 'goal' | 'data' {
  return value >= target ? 'goal' : 'data'
}
