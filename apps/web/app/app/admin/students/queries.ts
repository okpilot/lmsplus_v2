import { adminClient } from '@repo/db/admin'
import { createServerSupabaseClient } from '@repo/db/server'
import type { StudentFilters, StudentRow } from './types'

export async function getStudentsList(filters: StudentFilters): Promise<StudentRow[]> {
  let query = adminClient
    .from('users')
    .select('id, email, full_name, role, organization_id, last_active_at, created_at, deleted_at')
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
    query = query.or(`email.ilike.%${filters.search}%,full_name.ilike.%${filters.search}%`)
  }

  const { data, error } = await query

  if (error) {
    console.error('[getStudentsList] DB error:', error.message)
    throw new Error('Failed to fetch students')
  }

  return (data ?? []) as StudentRow[]
}

export async function getAdminOrganizationId(): Promise<string> {
  const supabase = await createServerSupabaseClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Not authenticated')
  }

  const { data, error } = await adminClient
    .from('users')
    .select('organization_id')
    .eq('id', user.id)
    .single()

  if (error || !data?.organization_id) {
    console.error('[getAdminOrganizationId] DB error:', error?.message)
    throw new Error('Failed to fetch organization')
  }

  return data.organization_id
}
