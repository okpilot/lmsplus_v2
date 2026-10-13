import { Stat, StatGroup } from '@/components/ui/stat'
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
}: Readonly<StatCardsProps>) {
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
    <StatGroup columns={3} className="grid-cols-3 sm:grid-cols-3 gap-2 md:gap-4">
      <Stat
        size="compact"
        label={
          <TileLabel short="Readiness" full="Exam Readiness">
            <InfoTooltip
              label="What is Exam Readiness?"
              title="Exam Readiness"
              description="Percentage of subjects where your mastery is 90% or above. Red: below 31%, amber: 31–70%, green: 71%+."
              align="left"
            />
          </TileLabel>
        }
        value={<span className={readinessColor}>{readinessPct}%</span>}
        hint={
          <>
            <span className="hidden md:block">
              {examReadiness.readyCount} / {examReadiness.totalCount} subjects at 90%+
            </span>
            <span className="hidden md:block">{projectionText}</span>
          </>
        }
      />

      <Stat
        size="compact"
        label={
          <TileLabel short="Today" full="Questions Today">
            <InfoTooltip
              label="What is Questions Today?"
              title="Questions Today"
              description="Questions answered today towards your daily goal of 50. Red: none yet, amber: in progress, green: goal reached."
              align="center"
            />
          </TileLabel>
        }
        value={
          <span className={todayColor}>
            {questionsToday} / {DAILY_GOAL}
          </span>
        }
        hint={
          <>
            <span className="mt-1 hidden h-1.5 w-full max-w-[120px] overflow-hidden rounded-full bg-muted md:block">
              <span
                className={`block h-full rounded-full transition-all ${todayBarColor}`}
                style={{ width: `${todayProgress}%` }}
              />
            </span>
            <span className="hidden md:block">
              {remaining > 0 ? `${remaining} more to hit your daily goal` : 'Daily goal reached!'}
            </span>
          </>
        }
      />

      <Stat
        size="compact"
        label={
          <TileLabel short="Streak" full="Study Streak">
            <InfoTooltip
              label="What is Study Streak?"
              title="Study Streak"
              description="Consecutive days with at least one question answered. Red: streak broken, amber: 1–6 days, green: 7+ days."
            />
          </TileLabel>
        }
        value={
          <span className={streakColor}>
            {currentStreak} {currentStreak === 1 ? 'day' : 'days'}
          </span>
        }
        hint={
          <span className="hidden md:block">
            Best: {bestStreak} {bestStreak === 1 ? 'day' : 'days'} — keep going!
          </span>
        }
      />
    </StatGroup>
  )
}

function TileLabel({
  short,
  full,
  children,
}: Readonly<{ short: string; full: string; children: React.ReactNode }>) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="md:hidden">{short}</span>
      <span className="hidden md:inline">{full}</span>
      {children}
    </span>
  )
}
