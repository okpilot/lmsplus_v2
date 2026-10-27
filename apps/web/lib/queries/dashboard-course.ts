import { cookies } from 'next/headers'
import { unstable_rethrow } from 'next/navigation'
import { cache } from 'react'
import {
  DASHBOARD_COURSE_COOKIE,
  type DashboardCourse,
  resolveDashboardCourse,
} from '@/lib/dashboard/resolve-course'
import { getMyCourses } from './my-courses'

/** Fails open like the shell (`loadShellUser`): no chips, all subjects. */
async function loadCourses(): Promise<DashboardCourse[]> {
  try {
    return await getMyCourses()
  } catch (error) {
    unstable_rethrow(error)
    console.error(
      '[getDashboardCourse] enrolments read failed:',
      error instanceof Error ? error.message : error,
    )
    return []
  }
}

export const getDashboardCourse = cache(
  async (): Promise<{ courses: DashboardCourse[]; selected: DashboardCourse | null }> => {
    const [courses, cookieStore] = await Promise.all([loadCourses(), cookies()])
    const selected = resolveDashboardCourse(
      courses,
      cookieStore.get(DASHBOARD_COURSE_COOKIE)?.value,
    )
    return { courses, selected }
  },
)
