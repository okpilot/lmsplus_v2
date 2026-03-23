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
    getDailyActivity(365),
  ])

  if (dataResult.status !== 'fulfilled') throw dataResult.reason
  const data = dataResult.value
  const daily = dailyResult.status === 'fulfilled' ? dailyResult.value : []

  return (
    <main className="space-y-8">
      <DashboardHeader />
      <div className="grid gap-8 md:grid-cols-2">
        <div className="order-2 md:order-1">
          <ActivityHeatmap data={daily} />
        </div>
        <div className="order-1 md:order-2">
          <StatCards
            examReadiness={data.examReadiness}
            questionsToday={data.questionsToday}
            currentStreak={data.currentStreak}
            bestStreak={data.bestStreak}
          />
        </div>
      </div>
      <section>
        <h2 className="mb-3 text-lg font-medium">Subject Progress</h2>
        <SubjectGrid subjects={data.subjects} />
      </section>
    </main>
  )
}
