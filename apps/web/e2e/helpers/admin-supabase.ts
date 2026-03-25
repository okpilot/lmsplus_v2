import { getAdminClient } from './supabase'

export const ADMIN_TEST_EMAIL = 'admin@lmsplus.local'
export const ADMIN_TEST_PASSWORD = 'admin123!'

/** Ensure the admin E2E test user exists with admin role and seeded question data. */
export async function ensureAdminTestUser() {
  const admin = getAdminClient()

  // Look up existing admin user
  const { data: userRow, error: userError } = await admin
    .from('users')
    .select('id, organization_id')
    .eq('email', ADMIN_TEST_EMAIL)
    .single()

  if (userRow) {
    // User exists — just ensure password matches
    const { error: resetError } = await admin.auth.admin.updateUserById(userRow.id, {
      password: ADMIN_TEST_PASSWORD,
    })
    if (resetError) throw new Error(`ensureAdminTestUser reset password: ${resetError.message}`)
    return { orgId: userRow.organization_id, userId: userRow.id }
  }

  // User doesn't exist — create auth user + public.users row + seed data
  // This handles CI where seed-admin-eval.ts hasn't been run
  if (userError && userError.code !== 'PGRST116') {
    throw new Error(`ensureAdminTestUser user lookup: ${userError.message}`)
  }

  // Find or create the org
  const { data: org } = await admin
    .from('organizations')
    .select('id')
    .eq('slug', 'egmont-aviation')
    .single()

  if (!org) {
    throw new Error(
      'Egmont Aviation org not found — the E2E database must have seeded question data. ' +
        'Run: pnpm dlx tsx apps/web/scripts/seed-admin-eval.ts',
    )
  }

  // Create auth user
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email: ADMIN_TEST_EMAIL,
    password: ADMIN_TEST_PASSWORD,
    email_confirm: true,
  })
  if (authError) throw new Error(`ensureAdminTestUser auth: ${authError.message}`)
  const userId = authData.user.id

  // Create public.users row with admin role
  const { error: insertError } = await admin.from('users').insert({
    id: userId,
    organization_id: org.id,
    email: ADMIN_TEST_EMAIL,
    full_name: 'E2E Admin User',
    role: 'admin',
  })
  if (insertError) throw new Error(`ensureAdminTestUser insert: ${insertError.message}`)

  return { orgId: org.id, userId }
}
