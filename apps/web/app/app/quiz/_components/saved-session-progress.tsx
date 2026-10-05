import { progressColor } from './draft-card'

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
      <div className="h-1 rounded-full bg-muted">
        <div className="h-1 rounded-full bg-primary" style={{ width: `${progress}%` }} />
      </div>
    </div>
  )
}
