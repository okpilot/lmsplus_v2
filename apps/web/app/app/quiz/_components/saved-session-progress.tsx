import { Progress } from '@/components/ui/meter'

export function progressColor(pct: number): string {
  if (pct >= 90) return 'text-green-600'
  if (pct < 50) return 'text-amber-500'
  return 'text-primary-text'
}

/** Answered-of-total line with a percentage and a progress bar. */
export function SavedSessionProgress({
  answered,
  total,
}: Readonly<{ answered: number; total: number }>) {
  const progress = total > 0 ? (answered / total) * 100 : 0

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">
          {answered} of {total} answered
        </span>
        <span className={`font-medium ${progressColor(progress)}`}>{Math.round(progress)}%</span>
      </div>
      <Progress value={progress} label="Answered questions" className="h-1" />
    </div>
  )
}
