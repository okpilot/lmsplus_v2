import type { createServerSupabaseClient } from '@repo/db/server'

type Supabase = Awaited<ReturnType<typeof createServerSupabaseClient>>

export type InvigilatorInfo = { name: string; active: boolean }

type UserRow = {
  full_name: string | null
  email?: string | null
  role?: string | null
  deleted_at: string | null
}

function toInfo(u: UserRow): InvigilatorInfo {
  return {
    name: u.full_name ?? u.email ?? 'Unknown',
    active: u.deleted_at === null && (u.role === 'admin' || u.role === 'instructor'),
  }
}

/**
 * Name and active flag of a sitting's invigilator, by organization and id.
 * The caller's own row reads under RLS; any other user needs the service role
 * (`users_select` is self-only), scoped by `organization_id` and `id`.
 */
export async function readInvigilator(
  supabase: Supabase,
  organizationId: string,
  id: string,
): Promise<InvigilatorInfo | null> {
  const own = await supabase
    .from('users')
    .select('full_name, email, role, deleted_at')
    .eq('organization_id', organizationId)
    .eq('id', id)
    .maybeSingle()
  if (own.data) return toInfo(own.data)
  const { readInvigilatorAdmin } = await import('./invigilator-reads')
  return readInvigilatorAdmin(organizationId, id)
}
