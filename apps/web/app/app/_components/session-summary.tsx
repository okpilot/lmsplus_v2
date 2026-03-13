import Link from 'next/link'

type SessionSummaryProps = {
  totalQuestions: number
  answeredCount: number
  correctCount: number
  scorePercentage: number
  mode: 'quick_quiz'
}

export function SessionSummary({
  totalQuestions,
  answeredCount,
  correctCount,
  scorePercentage,
}: SessionSummaryProps) {
  const label = 'Quiz'
  const skippedCount = totalQuestions - answeredCount
  const incorrectCount = answeredCount - correctCount

  return (
    <div className="mx-auto max-w-md space-y-6 text-center">
      <div>
        <p className="text-sm text-muted-foreground">{label} Complete</p>
        <p className="mt-2 text-5xl font-bold tabular-nums">{Math.round(scorePercentage)}%</p>
      </div>

      <div className="flex justify-center gap-8 text-sm">
        <div>
          <p className="text-2xl font-semibold tabular-nums text-green-600">{correctCount}</p>
          <p className="text-muted-foreground">Correct</p>
        </div>
        <div>
          <p className="text-2xl font-semibold tabular-nums text-destructive">{incorrectCount}</p>
          <p className="text-muted-foreground">Incorrect</p>
        </div>
        {skippedCount > 0 && (
          <div>
            <p className="text-2xl font-semibold tabular-nums text-muted-foreground">
              {skippedCount}
            </p>
            <p className="text-muted-foreground">Skipped</p>
          </div>
        )}
        <div>
          <p className="text-2xl font-semibold tabular-nums">{answeredCount}</p>
          <p className="text-muted-foreground">Answered</p>
        </div>
      </div>

      <div className="h-2 w-full rounded-full bg-muted">
        <div
          className="h-2 rounded-full bg-primary transition-all"
          style={{ width: `${scorePercentage}%` }}
        />
      </div>

      <div className="flex justify-center gap-3">
        <Link
          href="/app/dashboard"
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
        >
          Back to Dashboard
        </Link>
        <Link
          href="/app/quiz"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Start Another
        </Link>
      </div>
    </div>
  )
}
