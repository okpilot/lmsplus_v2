import { cookies } from 'next/headers'
import { cache } from 'react'
import {
  DASHBOARD_COURSE_COOKIE,
  type DashboardCourse,
  resolveDashboardCourse,
} from '@/lib/dashboard/resolve-course'
import { getMyCourses } from './my-courses'

export const getDashboardCourse = cache(
  async (): Promise<{ courses: DashboardCourse[]; selected: DashboardCourse | null }> => {
    const [courses, cookieStore] = await Promise.all([getMyCourses(), cookies()])
    const selected = resolveDashboardCourse(
      courses,
      cookieStore.get(DASHBOARD_COURSE_COOKIE)?.value,
    )
    return { courses, selected }
  },
)
