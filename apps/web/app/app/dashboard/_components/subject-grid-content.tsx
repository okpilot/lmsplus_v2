import { Heading } from '@/components/ui/heading'
import { getDashboardData } from '@/lib/queries/dashboard'
import { SubjectGrid } from './subject-grid'

export async function SubjectGridContent() {
  const data = await getDashboardData()

  return (
    <section>
      <Heading level={2} className="mb-3">
        Subject Progress
      </Heading>
      <SubjectGrid subjects={data.subjects} />
    </section>
  )
}
