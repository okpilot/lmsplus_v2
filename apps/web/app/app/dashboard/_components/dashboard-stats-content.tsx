import { getDashboardData } from '@/lib/queries/dashboard'
import { getDashboardCourse } from '@/lib/queries/dashboard-course'
import { StatCards } from './stat-cards'

export async function DashboardStatsContent() {
  const { selected } = await getDashboardCourse()
  const data = await getDashboardData(selected?.id ?? null)

  return (
    <StatCards
      examReadiness={data.examReadiness}
      questionsToday={data.questionsToday}
      currentStreak={data.currentStreak}
      bestStreak={data.bestStreak}
    />
  )
}
