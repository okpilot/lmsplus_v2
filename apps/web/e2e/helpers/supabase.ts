import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for E2E tests')

export const TEST_EMAIL = 'e2e-test@lmsplus.local'
export const TEST_PASSWORD = 'e2e-test-password-2026!'

export function getAdminClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/** Ensure the E2E test user exists in the Egmont Aviation org (which has seeded questions). */
export async function ensureTestUser() {
  const admin = getAdminClient()

  // Use the existing org that has seeded questions
  const { data: org, error: orgError } = await admin
    .from('organizations')
    .select('id')
    .eq('slug', 'egmont-aviation')
    .single()

  if (orgError) throw new Error(`ensureTestUser org lookup: ${orgError.message}`)
  if (!org) throw new Error('Egmont Aviation org not found — run question import first')
  const orgId = org.id

  // Check if auth user exists
  const { data: existingUsers, error: listError } = await admin.auth.admin.listUsers()
  if (listError) throw new Error(`ensureTestUser listUsers: ${listError.message}`)
  const existingAuth = existingUsers?.users.find((u: { email?: string }) => u.email === TEST_EMAIL)

  let userId: string
  if (existingAuth) {
    userId = existingAuth.id
    // Ensure password matches TEST_PASSWORD (may have been changed or set differently)
    const { error: resetError } = await admin.auth.admin.updateUserById(userId, {
      password: TEST_PASSWORD,
    })
    if (resetError) throw new Error(`ensureTestUser reset password: ${resetError.message}`)
  } else {
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
    })
    if (authError) throw new Error(`ensureTestUser auth: ${authError.message}`)
    userId = authData.user.id
  }

  // Ensure public.users row exists in the correct org
  const { data: userRow, error: userRowError } = await admin
    .from('users')
    .select('id, organization_id')
    .eq('id', userId)
    .single()

  // PGRST116 = "no rows found" which is expected for new users
  if (userRowError && userRowError.code !== 'PGRST116') {
    throw new Error(`ensureTestUser user lookup: ${userRowError.message}`)
  }

  if (!userRow) {
    const { error: userError } = await admin.from('users').insert({
      id: userId,
      organization_id: orgId,
      email: TEST_EMAIL,
      full_name: 'E2E Test Student',
      role: 'student',
    })
    if (userError) throw new Error(`ensureTestUser public: ${userError.message}`)
  } else if (userRow.organization_id !== orgId) {
    // Move user to the correct org
    const { error: updateError } = await admin
      .from('users')
      .update({ organization_id: orgId })
      .eq('id', userId)
    if (updateError) throw new Error(`ensureTestUser update org: ${updateError.message}`)
  }

  return { orgId, userId }
}
