import { requireAdmin } from '@/lib/auth/require-admin'
import type { GroupRow } from './types'

export async function getGroupsWithCounts(): Promise<GroupRow[]> {
  const { supabase } = await requireAdmin()

  const { data, error } = await supabase.rpc('get_student_groups_with_counts')
  if (error) {
    console.error('[getGroupsWithCounts] RPC error:', error.message)
    throw new Error('Failed to fetch groups')
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    active_count: row.active_count,
    deactivated_count: row.deactivated_count,
    created_at: row.created_at,
  }))
}
