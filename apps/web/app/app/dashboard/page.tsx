import { getDailyActivity } from '@/lib/queries/analytics'
import { getDashboardData } from '@/lib/queries/dashboard'
import { ActivityHeatmap } from './_components/activity-heatmap'
import { DashboardHeader } from './_components/dashboard-header'
import { StatCards } from './_components/stat-cards'
import { SubjectGrid } from './_components/subject-grid'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const [dataResult, dailyResult] = await Promise.allSettled([
    getDashboardData(),
    getDailyActivity(31),
  ])

  if (dataResult.status !== 'fulfilled') throw dataResult.reason
  const data = dataResult.value
  const daily = dailyResult.status === 'fulfilled' ? dailyResult.value : []

  return (
    <main className="space-y-8">
      <DashboardHeader />
      <StatCards
        examReadiness={data.examReadiness}
        questionsToday={data.questionsToday}
        currentStreak={data.currentStreak}
        bestStreak={data.bestStreak}
      />
      <ActivityHeatmap data={daily} />
      <section>
        <h2 className="mb-3 text-lg font-medium">Subject Progress</h2>
        <SubjectGrid subjects={data.subjects} />
      </section>
    </main>
  )
}
