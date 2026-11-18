import { adminClient } from '@repo/db/admin'
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
