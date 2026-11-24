import { adminClient } from '@repo/db/admin'
import { requireAdmin } from '@/lib/auth/require-admin'

export type InvigilatorInfo = { name: string; active: boolean }

type UserRow = {
  full_name: string | null
  email: string | null
  role: string | null
  deleted_at: string | null
}

export function staffName(u: { full_name: string | null; email: string | null }): string {
  return u.full_name ?? u.email ?? 'Unknown'
}

export function toInfo(u: UserRow): InvigilatorInfo {
  return {
    name: staffName(u),
    active: u.deleted_at === null && (u.role === 'admin' || u.role === 'instructor'),
  }
}

/**
 * Name and active flag of a sitting's invigilator. Service role (`users_select` is self-only),
 * scoped by `id` and the organization from `requireAdmin()`. No `deleted_at` filter: deactivated users are returned
 * so the page can mark an inactive invigilator (see `toInfo`).
 */
export async function readInvigilator(id: string): Promise<InvigilatorInfo | null> {
  const { organizationId } = await requireAdmin()
  const { data, error } = await adminClient
    .from('users')
    .select('full_name, email, role, deleted_at')
    .eq('organization_id', organizationId)
    .eq('id', id)
    .maybeSingle()
  if (error) {
    console.error('[readInvigilator] DB error:', error.message)
    throw new Error('Failed to load sitting')
  }
  return data ? toInfo(data) : null
}
