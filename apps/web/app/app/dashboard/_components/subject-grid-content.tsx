import { getDashboardData } from '@/lib/queries/dashboard'
import { SubjectGrid } from './subject-grid'

export async function SubjectGridContent() {
  const data = await getDashboardData()

  return (
    <section>
      <h2 className="mb-3 text-lg font-medium">Subject Progress</h2>
      <SubjectGrid subjects={data.subjects} />
    </section>
  )
}
