import { getDashboardCourse } from '@/lib/queries/dashboard-course'
import { DashboardCourseChips } from './dashboard-course-chips'

export async function DashboardCourseChipsContent() {
  const { courses, selected } = await getDashboardCourse()
  // key: a server-side fallback course (cookie course unenrolled) resets the pressed pill.
  return (
    <DashboardCourseChips
      key={selected?.code ?? 'none'}
      courses={courses}
      selectedCode={selected?.code ?? null}
    />
  )
}
