import Link from 'next/link'
import { getDailyActivity, getSubjectScores } from '@/lib/queries/analytics'
import { getDashboardData } from '@/lib/queries/dashboard'
import { ActivityChart } from './_components/activity-chart'
import { ActivityHeatmap } from './_components/activity-heatmap'
import { QuickActions } from './_components/quick-actions'
import { SubjectGrid } from './_components/subject-grid'
import { SubjectScoresChart } from './_components/subject-scores-chart'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const [dataResult, dailyActivityResult, subjectScoresResult] = await Promise.allSettled([
    getDashboardData(),
    getDailyActivity(),
    getSubjectScores(),
  ])

  if (dataResult.status !== 'fulfilled') throw dataResult.reason
  const data = dataResult.value
  const dailyActivity = dailyActivityResult.status === 'fulfilled' ? dailyActivityResult.value : []
  const subjectScores = subjectScoresResult.status === 'fulfilled' ? subjectScoresResult.value : []

  return (
    <main className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {data.answeredCount} questions answered across {data.subjects.length} subjects
        </p>
      </div>

      <QuickActions />

      <div className="grid gap-6 lg:grid-cols-2">
        <ActivityChart data={dailyActivity} />
        <ActivityHeatmap data={dailyActivity} />
      </div>

      <SubjectScoresChart data={subjectScores} />

      <section>
        <h2 className="mb-3 text-lg font-medium">Subject Progress</h2>
        <SubjectGrid subjects={data.subjects} />
      </section>

      <Link
        href="/app/reports"
        className="inline-block text-sm font-medium text-primary hover:underline"
      >
        View all reports →
      </Link>
    </main>
  )
}
