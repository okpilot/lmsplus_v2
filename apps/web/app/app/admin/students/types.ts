export type StudentRow = {
  id: string
  email: string
  full_name: string | null
  role: 'admin' | 'instructor' | 'student'
  organization_id: string
  last_active_at: string | null
  created_at: string
  deleted_at: string | null
}

export type StudentFilters = {
  status?: 'active' | 'inactive'
  role?: 'admin' | 'instructor' | 'student'
  search?: string
}
