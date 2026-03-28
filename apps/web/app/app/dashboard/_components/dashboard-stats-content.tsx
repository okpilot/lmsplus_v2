import { getDashboardData } from '@/lib/queries/dashboard'
import { StatCards } from './stat-cards'
import { SubjectGrid } from './subject-grid'

export async function DashboardStatsContent() {
  const data = await getDashboardData()

  return (
    <>
      <StatCards
        examReadiness={data.examReadiness}
        questionsToday={data.questionsToday}
        currentStreak={data.currentStreak}
        bestStreak={data.bestStreak}
      />
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-medium">Subject Progress</h2>
        <SubjectGrid subjects={data.subjects} />
      </section>
    </>
  )
}
