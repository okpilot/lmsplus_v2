import { adminClient } from '@repo/db/admin'
import type { InvigilatorInfo } from './invigilator-lookup'
import type { InvigilatorOption } from './types'

export async function readInvigilatorOptions(organizationId: string): Promise<InvigilatorOption[]> {
  const { data, error } = await adminClient
    .from('users')
    .select('id, full_name, email, role')
    .eq('organization_id', organizationId)
    .in('role', ['admin', 'instructor'])
    .is('deleted_at', null)
    .order('full_name')
  if (error) {
    console.error('[readInvigilatorOptions] DB error:', error.message)
    throw new Error('Failed to load invigilators')
  }
  return (data ?? []).map((u) => ({
    id: u.id,
    name: `${u.full_name ?? u.email ?? u.id} (${u.role})`,
  }))
}

export async function readInvigilatorAdmin(
  organizationId: string,
  id: string,
): Promise<InvigilatorInfo | null> {
  const { data, error } = await adminClient
    .from('users')
    .select('full_name, email, role, deleted_at')
    .eq('organization_id', organizationId)
    .eq('id', id)
    .maybeSingle()
  if (error) {
    console.error('[readInvigilatorAdmin] DB error:', error.message)
    throw new Error('Failed to load sitting')
  }
  if (!data) return null
  return {
    name: data.full_name ?? data.email ?? 'Unknown',
    active: data.deleted_at === null && (data.role === 'admin' || data.role === 'instructor'),
  }
}
