import { getDashboardCourse } from '@/lib/queries/dashboard-course'
import { DashboardCourseChips } from './dashboard-course-chips'

export async function DashboardCourseChipsContent() {
  const { courses, selected } = await getDashboardCourse()
  return <DashboardCourseChips courses={courses} selectedCode={selected?.code ?? null} />
}
