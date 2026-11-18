import { adminClient } from '@repo/db/admin'

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
    out.set(u.id, u.full_name ?? u.email ?? 'Unknown')
  }
  return out
}
