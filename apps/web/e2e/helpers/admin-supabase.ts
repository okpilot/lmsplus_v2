import { getAdminClient } from './supabase'

export const ADMIN_TEST_EMAIL = 'admin@lmsplus.local'
export const ADMIN_TEST_PASSWORD = 'admin123!'

/** Ensure the admin E2E test user exists and has admin role. */
export async function ensureAdminTestUser() {
  const admin = getAdminClient()

  const { data: userRow } = await admin
    .from('users')
    .select('id, organization_id')
    .eq('email', ADMIN_TEST_EMAIL)
    .single()

  if (!userRow) {
    throw new Error(
      'Admin test user not found. Run: pnpm dlx tsx apps/web/scripts/seed-admin-eval.ts',
    )
  }

  // Ensure auth password matches
  const { error: resetError } = await admin.auth.admin.updateUserById(userRow.id, {
    password: ADMIN_TEST_PASSWORD,
  })
  if (resetError) throw new Error(`ensureAdminTestUser reset password: ${resetError.message}`)

  return { orgId: userRow.organization_id, userId: userRow.id }
}
