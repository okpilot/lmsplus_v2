import { getDashboardData } from '@/lib/queries/dashboard'
import { DueReviewsBanner } from './_components/due-reviews-banner'
import { RecentSessions } from './_components/recent-sessions'
import { SubjectGrid } from './_components/subject-grid'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const data = await getDashboardData()

  return (
    <main className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {data.answeredCount} questions answered across {data.subjects.length} subjects
        </p>
      </div>

      <DueReviewsBanner dueCount={data.dueCount} />

      <section>
        <h2 className="mb-3 text-lg font-medium">Subject Progress</h2>
        <SubjectGrid subjects={data.subjects} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Recent Sessions</h2>
        <RecentSessions sessions={data.recentSessions} />
      </section>
    </main>
  )
}
