import { adminClient } from '@repo/db/admin'
import { unstable_rethrow } from 'next/navigation'
import { requireAdmin } from '@/lib/auth/require-admin'

/**
 * Display names of up to 100 people, deactivated ones included. Service role (`users_select` is self-only),
 * scoped by `organization_id` and `id`; ids come from RPC output or validated candidate ids.
 * security.md §15 exception (f): service-role read of users, org-scoped, includes deactivated.
 */
export async function readUserNames(
  organizationId: string,
  ids: readonly string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (ids.length === 0) return out
  const { data, error } = await adminClient
    .from('users')
    .select('id, full_name, email')
    .eq('organization_id', organizationId)
    .in('id', [...ids])
  if (error) {
    console.error('[readUserNames] DB error:', error.message)
    throw new Error('Failed to load people')
  }
  for (const u of data ?? []) {
    out.set(u.id, u.full_name || u.email || 'Unknown')
  }
  return out
}

/** One display name for a popup title. Cosmetic: a failed read must not fail the popup. */
export async function readUserName(userId: string): Promise<string> {
  try {
    const { organizationId } = await requireAdmin()
    return (await readUserNames(organizationId, [userId])).get(userId) ?? 'Unknown'
  } catch (error) {
    unstable_rethrow(error)
    return 'this person'
  }
}
