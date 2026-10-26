export type StudentRow = {
  id: string
  email: string
  full_name: string | null
  role: 'admin' | 'instructor' | 'student'
  organization_id: string
  last_active_at: string | null
  created_at: string
  deleted_at: string | null
  login_instructions_sent_at: string | null
  temp_password_expires_at: string | null
  course_ids: string[]
}

export type CourseOption = { id: string; short: string; name: string }

export type StudentFilters = {
  status?: 'active' | 'inactive'
  role?: 'admin' | 'instructor' | 'student'
  search?: string
}
