import { getDashboardData } from '@/lib/queries/dashboard'
import { StatCards } from './stat-cards'

export async function DashboardStatsContent() {
  const data = await getDashboardData()

  return (
    <StatCards
      examReadiness={data.examReadiness}
      questionsToday={data.questionsToday}
      currentStreak={data.currentStreak}
      bestStreak={data.bestStreak}
    />
  )
}
