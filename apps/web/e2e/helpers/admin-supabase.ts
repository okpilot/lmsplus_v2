import { getAdminClient } from './supabase'

export const ADMIN_TEST_EMAIL = 'admin@lmsplus.local'
export const ADMIN_TEST_PASSWORD = 'admin123!'

/** Ensure the admin E2E test user exists with admin role and seeded question data. */
export async function ensureAdminTestUser() {
  const admin = getAdminClient()

  // Resolve the org first — needed for both existing and new user paths
  const { data: org, error: orgError } = await admin
    .from('organizations')
    .select('id')
    .eq('slug', 'egmont-aviation')
    .single()

  if (orgError) throw new Error(`ensureAdminTestUser org query: ${orgError.message}`)
  if (!org) {
    throw new Error(
      'Egmont Aviation org not found — the E2E database must have seeded question data. ' +
        'Run: pnpm dlx tsx apps/web/scripts/seed-admin-eval.ts',
    )
  }

  // Look up existing admin user
  const { data: userRow, error: userError } = await admin
    .from('users')
    .select('id, organization_id, role')
    .eq('email', ADMIN_TEST_EMAIL)
    .single()

  if (userRow) {
    // Ensure password matches
    const { error: resetError } = await admin.auth.admin.updateUserById(userRow.id, {
      password: ADMIN_TEST_PASSWORD,
    })
    if (resetError) throw new Error(`ensureAdminTestUser reset password: ${resetError.message}`)

    // Ensure role and org are correct
    if (userRow.role !== 'admin' || userRow.organization_id !== org.id) {
      const { error: updateError } = await admin
        .from('users')
        .update({ role: 'admin', organization_id: org.id })
        .eq('id', userRow.id)
      if (updateError)
        throw new Error(`ensureAdminTestUser update role/org: ${updateError.message}`)
    }

    return { orgId: org.id, userId: userRow.id }
  }

  // User doesn't exist — create auth user + public.users row
  if (userError && userError.code !== 'PGRST116') {
    throw new Error(`ensureAdminTestUser user lookup: ${userError.message}`)
  }

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email: ADMIN_TEST_EMAIL,
    password: ADMIN_TEST_PASSWORD,
    email_confirm: true,
  })
  if (authError) throw new Error(`ensureAdminTestUser auth: ${authError.message}`)
  const userId = authData.user.id

  const { error: insertError } = await admin.from('users').insert({
    id: userId,
    organization_id: org.id,
    email: ADMIN_TEST_EMAIL,
    full_name: 'E2E Admin User',
    role: 'admin',
  })
  if (insertError) {
    // Rollback auth user to avoid orphaned account on next run
    await admin.auth.admin.deleteUser(userId)
    throw new Error(`ensureAdminTestUser insert: ${insertError.message}`)
  }

  return { orgId: org.id, userId }
}
