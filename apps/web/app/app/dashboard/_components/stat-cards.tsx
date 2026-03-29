import { InfoTooltip } from './info-tooltip'

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

  const readinessColor =
    readinessPct >= 71 ? 'text-green-500' : readinessPct >= 31 ? 'text-amber-500' : 'text-red-500'
  const todayColor =
    questionsToday >= DAILY_GOAL
      ? 'text-green-500'
      : questionsToday > 0
        ? 'text-amber-500'
        : 'text-red-500'
  const todayBarColor =
    questionsToday >= DAILY_GOAL
      ? 'bg-green-500'
      : questionsToday > 0
        ? 'bg-amber-500'
        : 'bg-red-500'
  const streakColor =
    currentStreak >= 7 ? 'text-green-500' : currentStreak > 0 ? 'text-amber-500' : 'text-red-500'

  return (
    <div className="grid grid-cols-3 gap-2 md:gap-4">
      {/* Exam Readiness */}
      <div className="relative rounded-xl border border-border bg-card p-2 text-center md:p-4">
        <div className="flex items-center justify-center gap-1">
          <p className="text-[10px] font-medium uppercase text-muted-foreground md:text-xs md:normal-case">
            <span className="md:hidden">Readiness</span>
            <span className="hidden md:inline">Exam Readiness</span>
          </p>
          <InfoTooltip
            label="What is Exam Readiness?"
            title="Exam Readiness"
            description="Percentage of subjects where your mastery is 90% or above. Red: below 31%, amber: 31–70%, green: 71%+."
            align="left"
          />
        </div>
        <p className={`mt-0.5 text-xl font-bold md:mt-1 md:text-3xl ${readinessColor}`}>
          {readinessPct}%
        </p>
        <p className="mt-1 hidden text-xs text-muted-foreground md:block">
          {examReadiness.readyCount} / {examReadiness.totalCount} subjects at 90%+
        </p>
        <p className="mt-1 hidden text-xs text-muted-foreground md:block">{projectionText}</p>
      </div>

      {/* Questions Today */}
      <div className="relative rounded-xl border border-border bg-card p-2 text-center md:p-4">
        <div className="flex items-center justify-center gap-1">
          <p className="text-[10px] font-medium uppercase text-muted-foreground md:text-xs md:normal-case">
            <span className="md:hidden">Today</span>
            <span className="hidden md:inline">Questions Today</span>
          </p>
          <InfoTooltip
            label="What is Questions Today?"
            title="Questions Today"
            description="Questions answered today towards your daily goal of 50. Red: none yet, amber: in progress, green: goal reached."
            align="center"
          />
        </div>
        <p className={`mt-0.5 text-xl font-bold md:mt-1 md:text-3xl ${todayColor}`}>
          {questionsToday} / {DAILY_GOAL}
        </p>
        <div className="mx-auto mt-2 hidden h-1.5 w-full max-w-[120px] overflow-hidden rounded-full bg-muted md:block">
          <div
            className={`h-full rounded-full transition-all ${todayBarColor}`}
            style={{ width: `${todayProgress}%` }}
          />
        </div>
        <p className="mt-1 hidden text-xs text-muted-foreground md:block">
          {remaining > 0 ? `${remaining} more to hit your daily goal` : 'Daily goal reached!'}
        </p>
      </div>

      {/* Study Streak */}
      <div className="relative rounded-xl border border-border bg-card p-2 text-center md:p-4">
        <div className="flex items-center justify-center gap-1">
          <p className="text-[10px] font-medium uppercase text-muted-foreground md:text-xs md:normal-case">
            <span className="md:hidden">Streak</span>
            <span className="hidden md:inline">Study Streak</span>
          </p>
          <InfoTooltip
            label="What is Study Streak?"
            title="Study Streak"
            description="Consecutive days with at least one question answered. Red: streak broken, amber: 1–6 days, green: 7+ days."
          />
        </div>
        <p className={`mt-0.5 text-xl font-bold md:mt-1 md:text-3xl ${streakColor}`}>
          {currentStreak} {currentStreak === 1 ? 'day' : 'days'}
        </p>
        <p className="mt-1 hidden text-xs text-muted-foreground md:block">
          Best: {bestStreak} days — keep going!
        </p>
      </div>
    </div>
  )
}
