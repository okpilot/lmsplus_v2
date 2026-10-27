export type DashboardCourse = { id: string; code: string; short: string; name: string }

export const DASHBOARD_COURSE_COOKIE = 'dashboard_course'

/** Cookie course if still enrolled, else the first enrolled course, else null. */
export function resolveDashboardCourse(
  courses: readonly DashboardCourse[],
  cookieValue: string | undefined,
): DashboardCourse | null {
  return courses.find((c) => c.code === cookieValue) ?? courses[0] ?? null
}
