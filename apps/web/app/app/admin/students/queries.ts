import { adminClient } from '@repo/db/admin'
import { requireAdmin } from '@/lib/auth/require-admin'
import { escapeLike } from '@/lib/utils/escape-like'
import type { CourseOption, StudentFilters, StudentRow } from './types'

export async function getStudentsList(filters: StudentFilters): Promise<StudentRow[]> {
  const { organizationId } = await requireAdmin()

  let query = adminClient
    .from('users')
    .select(
      'id, email, full_name, role, organization_id, last_active_at, created_at, deleted_at, login_instructions_sent_at, temp_password_expires_at, course_enrolments!course_enrolments_student_id_fkey(course_id)',
    )
    .is('course_enrolments.deleted_at', null)
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(200)

  if (filters.status === 'active') {
    query = query.is('deleted_at', null)
  } else if (filters.status === 'inactive') {
    query = query.not('deleted_at', 'is', null)
  }

  if (filters.role) {
    query = query.eq('role', filters.role)
  }

  if (filters.search) {
    const escaped = escapeLike(filters.search)
    query = query.or(`email.ilike.%${escaped}%,full_name.ilike.%${escaped}%`)
  }

  const { data, error } = await query

  if (error) {
    console.error('[getStudentsList] DB error:', error.message)
    throw new Error('Failed to fetch students')
  }

  return (data ?? []).map(({ course_enrolments, ...rest }) => ({
    ...rest,
    course_ids: course_enrolments.map((e) => e.course_id),
  })) as StudentRow[]
}

export async function getCourses(): Promise<CourseOption[]> {
  await requireAdmin()

  const { data, error } = await adminClient
    .from('courses')
    .select('id, short, name')
    .order('sort_order')

  if (error) {
    console.error('[getCourses] DB error:', error.message)
    throw new Error('Failed to fetch courses')
  }

  return data ?? []
}
