import { Heading } from '@/components/ui/heading'
import { getDashboardData } from '@/lib/queries/dashboard'
import { getDashboardCourse } from '@/lib/queries/dashboard-course'
import { SubjectGrid } from './subject-grid'

export async function SubjectGridContent() {
  const { selected } = await getDashboardCourse()
  const data = await getDashboardData(selected?.id ?? null)

  return (
    <section>
      <Heading level={2} className="mb-3">
        Subject Progress
      </Heading>
      <SubjectGrid subjects={data.subjects} />
    </section>
  )
}
