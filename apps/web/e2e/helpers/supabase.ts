import { createClient } from '@supabase/supabase-js'
import { CURRENT_PRIVACY_VERSION, CURRENT_TOS_VERSION } from '../../lib/consent/versions'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for E2E tests')

export const TEST_EMAIL = 'e2e-test@lmsplus.local'
export const TEST_PASSWORD = 'e2e-test-password-2026!'

// Separate user for login.spec — avoids invalidating the shared session
// via Supabase refresh token rotation when both tests sign in as the same user
export const LOGIN_TEST_EMAIL = 'e2e-login-test@lmsplus.local'
export const LOGIN_TEST_PASSWORD = 'e2e-login-test-password-2026!'

export function getAdminClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/** Seed consent records so the consent gate doesn't block E2E tests. */
export async function ensureConsentRecords(
  admin: ReturnType<typeof getAdminClient>,
  userId: string,
) {
  const { data: tosRows, error: tosError } = await admin
    .from('user_consents')
    .select('document_type')
    .eq('user_id', userId)
    .eq('accepted', true)
    .eq('document_type', 'terms_of_service')
    .eq('document_version', CURRENT_TOS_VERSION)
  if (tosError) throw new Error(`ensureConsentRecords: TOS query failed: ${tosError.message}`)

  const { data: privacyRows, error: privacyError } = await admin
    .from('user_consents')
    .select('document_type')
    .eq('user_id', userId)
    .eq('accepted', true)
    .eq('document_type', 'privacy_policy')
    .eq('document_version', CURRENT_PRIVACY_VERSION)
  if (privacyError)
    throw new Error(`ensureConsentRecords: privacy query failed: ${privacyError.message}`)

  const existingTypes = new Set([
    ...(tosRows ?? []).map((r: { document_type: string }) => r.document_type),
    ...(privacyRows ?? []).map((r: { document_type: string }) => r.document_type),
  ])

  const toInsert = []
  if (!existingTypes.has('terms_of_service')) {
    toInsert.push({
      user_id: userId,
      document_type: 'terms_of_service',
      document_version: CURRENT_TOS_VERSION,
      accepted: true,
    })
  }
  if (!existingTypes.has('privacy_policy')) {
    toInsert.push({
      user_id: userId,
      document_type: 'privacy_policy',
      document_version: CURRENT_PRIVACY_VERSION,
      accepted: true,
    })
  }

  if (toInsert.length > 0) {
    const { error } = await admin.from('user_consents').insert(toInsert)
    if (error) throw new Error(`ensureConsentRecords: ${error.message}`)
  }
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

  await ensureConsentRecords(admin, userId)
  return { orgId, userId }
}

/** Ensure a separate login-test user exists (used by login.spec to avoid session invalidation). */
export async function ensureLoginTestUser() {
  const admin = getAdminClient()

  const { data: org, error: orgError } = await admin
    .from('organizations')
    .select('id')
    .eq('slug', 'egmont-aviation')
    .single()

  if (orgError || !org) throw new Error(`ensureLoginTestUser org lookup: ${orgError?.message}`)
  const orgId = org.id

  const { data: existingUsers, error: listError } = await admin.auth.admin.listUsers()
  if (listError) throw new Error(`ensureLoginTestUser listUsers: ${listError.message}`)
  const existingAuth = existingUsers?.users.find(
    (u: { email?: string }) => u.email === LOGIN_TEST_EMAIL,
  )

  let userId: string
  if (existingAuth) {
    userId = existingAuth.id
    const { error: resetError } = await admin.auth.admin.updateUserById(userId, {
      password: LOGIN_TEST_PASSWORD,
    })
    if (resetError) throw new Error(`ensureLoginTestUser reset password: ${resetError.message}`)
  } else {
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email: LOGIN_TEST_EMAIL,
      password: LOGIN_TEST_PASSWORD,
      email_confirm: true,
    })
    if (authError) throw new Error(`ensureLoginTestUser auth: ${authError.message}`)
    userId = authData.user.id
  }

  const { data: userRow, error: userRowError } = await admin
    .from('users')
    .select('id, organization_id')
    .eq('id', userId)
    .single()

  if (userRowError && userRowError.code !== 'PGRST116') {
    throw new Error(`ensureLoginTestUser user lookup: ${userRowError.message}`)
  }

  if (!userRow) {
    const { error: userError } = await admin.from('users').insert({
      id: userId,
      organization_id: orgId,
      email: LOGIN_TEST_EMAIL,
      full_name: 'E2E Login Test Student',
      role: 'student',
    })
    if (userError) throw new Error(`ensureLoginTestUser public: ${userError.message}`)
  } else if (userRow.organization_id !== orgId) {
    // Move user to the correct org (mirrors ensureTestUser pattern)
    const { error: updateError } = await admin
      .from('users')
      .update({ organization_id: orgId })
      .eq('id', userId)
    if (updateError) throw new Error(`ensureLoginTestUser update org: ${updateError.message}`)
  }

  await ensureConsentRecords(admin, userId)
  return { orgId, userId }
}
