import { Progress } from '@/components/ui/meter'

/** Answered-of-total line with a percentage and a progress bar. */
export function SavedSessionProgress({
  answered,
  total,
}: Readonly<{ answered: number; total: number }>) {
  const progress = total > 0 ? (answered / total) * 100 : 0

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-caption">
        <span className="text-muted-foreground">
          {answered} of {total} answered
        </span>
        <span className="font-medium text-muted-foreground">{Math.round(progress)}%</span>
      </div>
      <Progress value={progress} label="Answered questions" />
    </div>
  )
}
