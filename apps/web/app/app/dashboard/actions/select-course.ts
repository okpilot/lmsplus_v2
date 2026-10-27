'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { z } from 'zod'
import type { ActionResult } from '@/lib/action-result'
import { requireAuthUser } from '@/lib/auth/require-auth-user'
import { DASHBOARD_COURSE_COOKIE } from '@/lib/dashboard/resolve-course'
import { getMyCourses } from '@/lib/queries/my-courses'

const SelectCourseInput = z.object({ code: z.string().regex(/^[A-Z0-9_]{1,20}$/) })

export async function selectDashboardCourse(raw: unknown): Promise<ActionResult> {
  await requireAuthUser()
  const parsed = SelectCourseInput.safeParse(raw)
  if (!parsed.success) return { success: false, error: 'Invalid input' }

  const courses = await getMyCourses()
  if (!courses.some((c) => c.code === parsed.data.code)) {
    return { success: false, error: 'Not enrolled in this course' }
  }

  const cookieStore = await cookies()
  cookieStore.set(DASHBOARD_COURSE_COOKIE, parsed.data.code, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/app',
    maxAge: 60 * 60 * 24 * 365,
    secure: process.env.NODE_ENV === 'production',
  })
  revalidatePath('/app/dashboard')
  return { success: true }
}
