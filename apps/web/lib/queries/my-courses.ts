import { createServerSupabaseClient } from '@repo/db/server'
import { cache } from 'react'
import { getSessionUser } from '@/lib/auth/get-session-user'
import type { DashboardCourse } from '@/lib/dashboard/resolve-course'

type EnrolmentRow = { courses: (DashboardCourse & { sort_order: number }) | null }

/**
 * The session user's own active enrolments. Filters `user_id` explicitly: the admin org-wide
 * RLS policy would otherwise return every student's rows.
 */
export const getMyCourses = cache(async (): Promise<DashboardCourse[]> => {
  const user = await getSessionUser()
  if (!user) throw new Error('Not authenticated')
  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('course_enrolments')
    .select('courses(id, code, short, name, sort_order)')
    .eq('user_id', user.id)
    .is('deleted_at', null)
  if (error) throw new Error(`Failed to fetch courses: ${error.message}`)
  return ((data ?? []) as unknown as EnrolmentRow[])
    .flatMap((row) => (row.courses ? [row.courses] : []))
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(({ id, code, short, name }) => ({ id, code, short, name }))
})
