import { adminClient } from '@repo/db/admin'
import { requireAdmin } from '@/lib/auth/require-admin'
import type { GroupRow } from './types'

async function countActiveMembers(organizationId: string, groupId: string): Promise<number> {
  const { count, error } = await adminClient
    .from('student_group_members')
    .select('id, users!student_group_members_user_id_fkey!inner(id)', {
      count: 'exact',
      head: true,
    })
    .eq('organization_id', organizationId)
    .eq('group_id', groupId)
    .is('deleted_at', null)
    .is('users.deleted_at', null)
    .eq('users.role', 'student')

  if (error) {
    console.error('[getGroupsWithCounts] Member count error:', error.message)
    throw new Error('Failed to fetch groups')
  }
  return count ?? 0
}

export async function getGroupsWithCounts(): Promise<GroupRow[]> {
  const { organizationId } = await requireAdmin()

  const { data, error } = await adminClient
    .from('student_groups')
    .select('id, name, description, created_at')
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .order('name')

  if (error) {
    console.error('[getGroupsWithCounts] DB error:', error.message)
    throw new Error('Failed to fetch groups')
  }

  return Promise.all(
    (data ?? []).map(async (g) => ({
      ...g,
      member_count: await countActiveMembers(organizationId, g.id),
    })),
  )
}
