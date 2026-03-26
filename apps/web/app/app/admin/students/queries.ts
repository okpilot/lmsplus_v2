import { adminClient } from '@repo/db/admin'
import { requireAdmin } from '@/lib/auth/require-admin'
import type { StudentFilters, StudentRow } from './types'

function escapeLike(value: string): string {
  return value.replaceAll(/[%_\\]/g, String.raw`\$&`)
}

export async function getStudentsList(filters: StudentFilters): Promise<StudentRow[]> {
  const { organizationId } = await requireAdmin()

  let query = adminClient
    .from('users')
    .select('id, email, full_name, role, organization_id, last_active_at, created_at, deleted_at')
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

  return (data ?? []) as StudentRow[]
}
