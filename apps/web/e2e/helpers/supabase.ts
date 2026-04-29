import { createClient, type SupabaseClient } from '@supabase/supabase-js'
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

// Separate user for internal-exam specs in the admin-e2e project. The regular
// e2e project's specs run first and rotate `e2e/.auth/user.json`'s session via
// @supabase/ssr refresh, deleting the auth.sessions row referenced by the saved
// access_token. By the time admin-e2e specs spawn a student context from
// user.json, gotrue rejects the token (session_id no longer exists). Same
// rationale as LOGIN_TEST_EMAIL above.
export const INTERNAL_EXAM_STUDENT_EMAIL = 'e2e-internal-exam@lmsplus.local'
export const INTERNAL_EXAM_STUDENT_PASSWORD = 'e2e-internal-exam-password-2026!'

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

/** Ensure a separate internal-exam student exists (used by admin-e2e/internal-exam-* specs). */
export async function ensureInternalExamStudentUser() {
  const admin = getAdminClient()

  const { data: org, error: orgError } = await admin
    .from('organizations')
    .select('id')
    .eq('slug', 'egmont-aviation')
    .single()

  if (orgError || !org)
    throw new Error(`ensureInternalExamStudentUser org lookup: ${orgError?.message}`)
  const orgId = org.id

  const { data: existingUsers, error: listError } = await admin.auth.admin.listUsers()
  if (listError) throw new Error(`ensureInternalExamStudentUser listUsers: ${listError.message}`)
  const existingAuth = existingUsers?.users.find(
    (u: { email?: string }) => u.email === INTERNAL_EXAM_STUDENT_EMAIL,
  )

  let userId: string
  if (existingAuth) {
    userId = existingAuth.id
    const { error: resetError } = await admin.auth.admin.updateUserById(userId, {
      password: INTERNAL_EXAM_STUDENT_PASSWORD,
    })
    if (resetError)
      throw new Error(`ensureInternalExamStudentUser reset password: ${resetError.message}`)
  } else {
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email: INTERNAL_EXAM_STUDENT_EMAIL,
      password: INTERNAL_EXAM_STUDENT_PASSWORD,
      email_confirm: true,
    })
    if (authError) throw new Error(`ensureInternalExamStudentUser auth: ${authError.message}`)
    userId = authData.user.id
  }

  const { data: userRow, error: userRowError } = await admin
    .from('users')
    .select('id, organization_id')
    .eq('id', userId)
    .single()

  if (userRowError && userRowError.code !== 'PGRST116') {
    throw new Error(`ensureInternalExamStudentUser user lookup: ${userRowError.message}`)
  }

  if (!userRow) {
    const { error: userError } = await admin.from('users').insert({
      id: userId,
      organization_id: orgId,
      email: INTERNAL_EXAM_STUDENT_EMAIL,
      full_name: 'E2E Internal Exam Student',
      role: 'student',
    })
    if (userError) throw new Error(`ensureInternalExamStudentUser public: ${userError.message}`)
  } else if (userRow.organization_id !== orgId) {
    const { error: updateError } = await admin
      .from('users')
      .update({ organization_id: orgId })
      .eq('id', userId)
    if (updateError)
      throw new Error(`ensureInternalExamStudentUser update org: ${updateError.message}`)
  }

  await ensureConsentRecords(admin, userId)
  return { orgId, userId }
}

/**
 * Force-end any active internal-exam session that the dedicated student left
 * open from a prior test, by voiding the linked code via the audited admin RPC.
 *
 * Why this exists: tests that exercise mid-session behavior (resume, void, etc.)
 * don't always submit before exiting, so quiz_sessions rows survive with
 * ended_at IS NULL. The next test's start_internal_exam_session then raises
 * 'active_session_exists', the modal renders the inline error, and the redirect
 * never fires — see issue #587 for the full repro.
 *
 * Uses `void_internal_exam_code(p_code_id, p_reason)` so cleanup goes through
 * the same SECURITY DEFINER path that the admin "Void" button uses in
 * production: writes the audit event, sets ended_at, marks passed=false, and
 * voids the code. No raw UPDATEs.
 */
export async function cleanupInternalExamStudentActiveSessions(
  adminAuthedClient: SupabaseClient,
): Promise<void> {
  const admin = getAdminClient()

  const { data: studentRow, error: studentError } = await admin
    .from('users')
    .select('id')
    .eq('email', INTERNAL_EXAM_STUDENT_EMAIL)
    .maybeSingle()
  if (studentError)
    throw new Error(`cleanupInternalExamStudentActiveSessions student: ${studentError.message}`)
  if (!studentRow) return

  // FK-hint syntax (`!`), not column-alias (`:`). The colon form silently
  // returns null on resolution failure; the hint form errors loudly. Project
  // memory: "PostgREST `:` vs `!` alias-vs-hint silent-null trap" — see
  // production pattern in lib/queries.ts where this same join uses `!`.
  const { data: codes, error: codesError } = await admin
    .from('internal_exam_codes')
    .select('id, consumed_session_id, quiz_sessions!consumed_session_id (ended_at)')
    .eq('student_id', studentRow.id)
    .not('consumed_session_id', 'is', null)
    .is('voided_at', null)
    .is('deleted_at', null)
  if (codesError)
    throw new Error(`cleanupInternalExamStudentActiveSessions codes: ${codesError.message}`)

  type CodeRow = {
    id: string
    consumed_session_id: string
    quiz_sessions: { ended_at: string | null } | null
  }
  const stale = (codes ?? []).filter(
    (row): row is CodeRow =>
      row.consumed_session_id !== null && row.quiz_sessions?.ended_at == null,
  )
  if (stale.length === 0) return

  for (const row of stale) {
    const { error } = await adminAuthedClient.rpc('void_internal_exam_code', {
      p_code_id: row.id,
      p_reason: 'e2e-cleanup',
    })
    if (error)
      throw new Error(
        `cleanupInternalExamStudentActiveSessions void code ${row.id}: ${error.message}`,
      )
  }

  // Also discard any non-internal-exam sessions (practice/study) the student
  // left active in a prior reports-separation run. Same effect as the user
  // clicking the Discard button (soft-delete via deleted_at) — see
  // app/app/quiz/actions/discard.ts. The internal-exam student is dedicated to
  // this suite, so leftover practice sessions should never persist between runs.
  // Chain `.select('id')` per code-style.md §5 zero-row no-op rule — the
  // service-role UPDATE returns 200 OK with empty rows when the filter matches
  // nothing, which is a valid steady state (nothing to clean) but only safe to
  // treat as success if observable.
  const { data: discarded, error: discardError } = await admin
    .from('quiz_sessions')
    .update({ deleted_at: new Date().toISOString() })
    .eq('student_id', studentRow.id)
    .neq('mode', 'internal_exam')
    .is('ended_at', null)
    .is('deleted_at', null)
    .select('id')
  if (discardError)
    throw new Error(`cleanupInternalExamStudentActiveSessions practice: ${discardError.message}`)
  if ((discarded?.length ?? 0) > 0) {
    console.log(
      `[cleanupInternalExamStudentActiveSessions] discarded ${discarded?.length} leftover practice/study session(s)`,
    )
  }
}
