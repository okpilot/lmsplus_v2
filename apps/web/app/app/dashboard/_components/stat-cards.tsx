const DAILY_GOAL = 50

type StatCardsProps = {
  examReadiness: { readyCount: number; totalCount: number; projectedDate: string | null }
  questionsToday: number
  currentStreak: number
  bestStreak: number
}

export function StatCards({
  examReadiness,
  questionsToday,
  currentStreak,
  bestStreak,
}: StatCardsProps) {
  const readinessPct =
    examReadiness.totalCount > 0
      ? Math.round((examReadiness.readyCount / examReadiness.totalCount) * 100)
      : 0

  const todayProgress = Math.min(Math.round((questionsToday / DAILY_GOAL) * 100), 100)
  const remaining = Math.max(DAILY_GOAL - questionsToday, 0)

  const projectionText = examReadiness.projectedDate
    ? `Est. ready by ${examReadiness.projectedDate}`
    : 'Keep practicing'

  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="rounded-xl border border-border bg-card p-4 text-center">
        <p className="text-xs font-medium text-muted-foreground">Exam Readiness</p>
        <p className="mt-1 text-3xl font-bold text-amber-500">{readinessPct}%</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {examReadiness.readyCount} / {examReadiness.totalCount} subjects at 90%+
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{projectionText}</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 text-center">
        <p className="text-xs font-medium text-muted-foreground">Questions Today</p>
        <p className="mt-1 text-3xl font-bold text-amber-500">
          {questionsToday} / {DAILY_GOAL}
        </p>
        <div className="mx-auto mt-2 h-1.5 w-full max-w-[120px] overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-amber-500 transition-all"
            style={{ width: `${todayProgress}%` }}
          />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {remaining > 0 ? `${remaining} more to hit your daily goal` : 'Daily goal reached!'}
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 text-center">
        <p className="text-xs font-medium text-muted-foreground">Study Streak</p>
        <p className="mt-1 text-3xl font-bold text-amber-500">{currentStreak} days</p>
        <p className="mt-1 text-xs text-muted-foreground">Best: {bestStreak} days — keep going!</p>
      </div>
    </div>
  )
}
