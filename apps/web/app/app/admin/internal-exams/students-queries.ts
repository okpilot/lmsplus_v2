import { adminClient } from '@repo/db/admin'
import { requireAdmin } from '@/lib/auth/require-admin'
import { fetchAllRows } from '@/lib/supabase-paginate'
import type { OrgStudentOption } from './types'

type StudentRowRaw = { id: string; full_name: string | null; email: string | null }

// adminClient (service role) bypasses RLS: cross-row reads on `users` are
// unreliable under tenant_isolation RLS (self-referential subquery). Mirrors
// apps/web/app/app/admin/students/queries.ts. The count and page queries share
// the identical org + role + deleted_at filter so the total matches the page set.
function studentsCountQuery(organizationId: string) {
  return adminClient
    .from('users')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('role', 'student')
    .is('deleted_at', null)
}

function studentsPageQuery(organizationId: string, from: number, to: number) {
  return adminClient
    .from('users')
    .select('id, full_name, email')
    .eq('organization_id', organizationId)
    .eq('role', 'student')
    .is('deleted_at', null)
    .order('full_name', { ascending: true })
    .order('id', { ascending: true })
    .range(from, to)
}

// Paginated via fetchAllRows to defeat the PostgREST 1000-row cap (#668).
export async function listOrgStudents(): Promise<OrgStudentOption[]> {
  const { organizationId } = await requireAdmin()
  const { data, error } = await fetchAllRows<StudentRowRaw>(
    () => studentsCountQuery(organizationId),
    (from, to) => studentsPageQuery(organizationId, from, to),
  )

  if (error) {
    console.error('[listOrgStudents] DB error:', error.message)
    throw new Error('Failed to load students')
  }

  return data.map((r) => ({
    id: r.id,
    fullName: r.full_name ?? '',
    email: r.email ?? '',
  }))
}
