import { Stat, StatGroup } from '@/components/ui/stat'
import { TileLabel } from './tile-label'

const DAILY_GOAL = 50

type StatCardsProps = {
  examReadiness: { readyCount: number; totalCount: number; projectedDate: string | null }
  questionsToday: number
  currentStreak: number
  bestStreak: number
}

const READINESS_TIP =
  'Percentage of subjects where your mastery is 90% or above. Red: below 31%, amber: 31–70%, green: 71%+.'
const TODAY_TIP =
  'Questions answered today towards your daily goal of 50. Red: none yet, amber: in progress, green: goal reached.'
const STREAK_TIP =
  'Consecutive days with at least one question answered. Red: streak broken, amber: 1–6 days, green: 7+ days.'
const TILE_PADDING = 'px-3 md:px-card'
const HINT_CLASS = 'hidden md:flex md:flex-col'

export function StatCards({
  examReadiness,
  questionsToday,
  currentStreak,
  bestStreak,
}: Readonly<StatCardsProps>) {
  return (
    <StatGroup columns={3} className="gap-2 md:gap-4">
      <ReadinessTile {...examReadiness} />
      <TodayTile questionsToday={questionsToday} />
      <StreakTile currentStreak={currentStreak} bestStreak={bestStreak} />
    </StatGroup>
  )
}

type Readiness = StatCardsProps['examReadiness']

function ReadinessTile({ readyCount, totalCount, projectedDate }: Readonly<Readiness>) {
  const pct = totalCount > 0 ? Math.round((readyCount / totalCount) * 100) : 0
  const color = pct >= 71 ? 'text-green-500' : pct >= 31 ? 'text-amber-500' : 'text-red-500'
  const projection = projectedDate ? `Est. ready by ${projectedDate}` : 'Keep practicing'
  return (
    <Stat
      size="compact"
      contentClassName={TILE_PADDING}
      label={
        <TileLabel
          short="Readiness"
          full="Exam Readiness"
          description={READINESS_TIP}
          align="left"
        />
      }
      value={<span className={color}>{pct}%</span>}
      hintClassName={HINT_CLASS}
      hint={
        <>
          <span className="block">
            {readyCount} / {totalCount} subjects at 90%+
          </span>
          <span className="block">{projection}</span>
        </>
      }
    />
  )
}

function TodayTile({ questionsToday }: Readonly<{ questionsToday: number }>) {
  const progress = Math.min(Math.round((questionsToday / DAILY_GOAL) * 100), 100)
  const remaining = Math.max(DAILY_GOAL - questionsToday, 0)
  const { color, barColor } = goalColors(questionsToday)
  return (
    <Stat
      size="compact"
      contentClassName={TILE_PADDING}
      label={
        <TileLabel short="Today" full="Questions Today" description={TODAY_TIP} align="center" />
      }
      value={
        <span className={color}>
          {questionsToday} / {DAILY_GOAL}
        </span>
      }
      hintClassName={HINT_CLASS}
      hint={
        <>
          <DailyGoalBar progress={progress} color={barColor} />
          <span className="block">
            {remaining > 0 ? `${remaining} more to hit your daily goal` : 'Daily goal reached!'}
          </span>
        </>
      }
    />
  )
}

function StreakTile({
  currentStreak,
  bestStreak,
}: Readonly<{ currentStreak: number; bestStreak: number }>) {
  const color =
    currentStreak >= 7 ? 'text-green-500' : currentStreak > 0 ? 'text-amber-500' : 'text-red-500'
  return (
    <Stat
      size="compact"
      contentClassName={TILE_PADDING}
      label={<TileLabel short="Streak" full="Study Streak" description={STREAK_TIP} />}
      value={
        <span className={color}>
          {currentStreak} {currentStreak === 1 ? 'day' : 'days'}
        </span>
      }
      hintClassName={HINT_CLASS}
      hint={
        <span className="block">
          Best: {bestStreak} {bestStreak === 1 ? 'day' : 'days'} — keep going!
        </span>
      }
    />
  )
}

function goalColors(questionsToday: number) {
  if (questionsToday >= DAILY_GOAL) return { color: 'text-green-500', barColor: 'bg-green-500' }
  if (questionsToday > 0) return { color: 'text-amber-500', barColor: 'bg-amber-500' }
  return { color: 'text-red-500', barColor: 'bg-red-500' }
}

function DailyGoalBar({ progress, color }: Readonly<{ progress: number; color: string }>) {
  return (
    <span className="mt-1 block h-1.5 w-full max-w-[120px] overflow-hidden rounded-full bg-muted">
      <span
        className={`block h-full rounded-full transition-all ${color}`}
        style={{ width: `${progress}%` }}
      />
    </span>
  )
}
