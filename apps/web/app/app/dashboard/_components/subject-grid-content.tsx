import { getDashboardData } from '@/lib/queries/dashboard'
import { getDashboardCourse } from '@/lib/queries/dashboard-course'
import { SubjectGrid } from './subject-grid'

export async function SubjectGridContent() {
  const { selected } = await getDashboardCourse()
  const data = await getDashboardData(selected?.id ?? null)

  return (
    <section>
      <h2 className="mb-3 text-lg font-medium">Subject Progress</h2>
      <SubjectGrid subjects={data.subjects} />
    </section>
  )
}
