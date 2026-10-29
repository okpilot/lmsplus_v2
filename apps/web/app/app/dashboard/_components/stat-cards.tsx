import { Meter, type MeterTone } from '@/components/ui/meter'
import { Stat, StatGroup } from '@/components/ui/stat'
import { goalMeterTone, MASTERY_GOAL } from '@/lib/utils/mastery-tone'
import {
  DAILY_GOAL,
  dailyGoalProgress,
  progressTone,
  readinessPct,
  readinessTone,
  STREAK_TARGET,
} from '../_lib/tile-tones'
import { TileLabel } from './tile-label'

type StatCardsProps = {
  examReadiness: { readyCount: number; totalCount: number; projectedDate: string | null }
  questionsToday: number
  currentStreak: number
  bestStreak: number
}

const READINESS_TIP = `Percentage of subjects where your mastery is ${MASTERY_GOAL}% or above. Green: ${MASTERY_GOAL}%+.`
const TODAY_TIP = `Questions answered today towards your daily goal of ${DAILY_GOAL}. Green: goal reached.`
const STREAK_TIP = `Consecutive days with at least one question answered. Green: ${STREAK_TARGET}+ days.`
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
  const pct = readinessPct(readyCount, totalCount)
  const projection = projectedDate ? `Est. ready by ${projectedDate}` : 'Keep practicing'
  return (
    <Stat
      size="compact"
      tone={readinessTone(pct)}
      contentClassName={TILE_PADDING}
      label={
        <TileLabel
          short="Readiness"
          full="Exam Readiness"
          description={READINESS_TIP}
          align="left"
        />
      }
      value={`${pct}%`}
      hintClassName={HINT_CLASS}
      hint={
        <>
          <span className="block">
            {readyCount} / {totalCount} subjects at {MASTERY_GOAL}%+
          </span>
          <span className="block">{projection}</span>
        </>
      }
    />
  )
}

function TodayTile({ questionsToday }: Readonly<{ questionsToday: number }>) {
  const { progress, remaining } = dailyGoalProgress(questionsToday)
  const tone = progressTone(questionsToday, DAILY_GOAL)
  return (
    <Stat
      size="compact"
      tone={tone}
      contentClassName={TILE_PADDING}
      label={
        <TileLabel short="Today" full="Questions Today" description={TODAY_TIP} align="center" />
      }
      value={`${questionsToday} / ${DAILY_GOAL}`}
      hintClassName={HINT_CLASS}
      hint={
        <>
          <DailyGoalBar progress={progress} tone={goalMeterTone(questionsToday, DAILY_GOAL)} />
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
  return (
    <Stat
      size="compact"
      tone={progressTone(currentStreak, STREAK_TARGET)}
      contentClassName={TILE_PADDING}
      label={<TileLabel short="Streak" full="Study Streak" description={STREAK_TIP} />}
      value={`${currentStreak} ${currentStreak === 1 ? 'day' : 'days'}`}
      hintClassName={HINT_CLASS}
      hint={
        <span className="block">
          Best: {bestStreak} {bestStreak === 1 ? 'day' : 'days'} — keep going!
        </span>
      }
    />
  )
}

function DailyGoalBar({ progress, tone }: Readonly<{ progress: number; tone: MeterTone }>) {
  return (
    <Meter
      value={progress}
      tone={tone}
      label="Daily goal progress"
      className="mt-1 max-w-[120px]"
    />
  )
}
