import { expect } from '@playwright/test'
import type { getAdminClient } from '../../helpers/supabase'

/**
 * Pins that `email` is a live (not soft-deleted) non-admin 'student'. is_admin() is
 * `role = 'admin' AND deleted_at IS NULL` and both halves raise the same `not_admin`, so a
 * soft-deleted attacker would leave a role-denial arm green while covering only the
 * deleted_at half. upsertUser deliberately does not reset deleted_at (see seed-core.ts).
 */
export async function expectLiveStudent(
  admin: ReturnType<typeof getAdminClient>,
  email: string,
): Promise<void> {
  const { data, error } = await admin
    .from('users')
    .select('role, deleted_at')
    .eq('email', email)
    .single()
  expect(error).toBeNull()
  expect(data?.role).toBe('student')
  expect(data?.deleted_at).toBeNull()
}
