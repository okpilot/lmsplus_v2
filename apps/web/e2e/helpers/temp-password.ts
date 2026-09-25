import { ensureConsentRecords, getAdminClient } from './supabase'

/** Marker prefix for throwaway students created by the temp-password specs. */
export const E2E_TEMP_PASSWORD_EMAIL_PREFIX = 'e2e-temp-password-'
const E2E_TEMP_PASSWORD_DOMAIN = '@lmsplus.local'

export function uniqueTempPasswordEmail(): string {
  return `${E2E_TEMP_PASSWORD_EMAIL_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}${E2E_TEMP_PASSWORD_DOMAIN}`
}

type ArmedStudent = { userId: string; email: string; orgId: string }

/**
 * Creates a dedicated throwaway student in the Egmont Aviation org, sets their
 * Auth password via service role, and arms `temp_password_expires_at` at
 * `Date.now() + expiresInMs` — a negative `expiresInMs` arms an
 * already-expired account. Seeds consent records so the consent gate never
 * masks the temp-password gate under test.
 */
export async function createArmedTempPasswordStudent(opts: {
  password: string
  expiresInMs: number
  fullName?: string
}): Promise<ArmedStudent> {
  const admin = getAdminClient()
  const email = uniqueTempPasswordEmail()

  const { data: org, error: orgError } = await admin
    .from('organizations')
    .select('id')
    .eq('slug', 'egmont-aviation')
    .single()
  if (orgError || !org) {
    throw new Error(`createArmedTempPasswordStudent org lookup: ${orgError?.message}`)
  }

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password: opts.password,
    email_confirm: true,
  })
  if (authError || !authData?.user) {
    throw new Error(`createArmedTempPasswordStudent auth: ${authError?.message}`)
  }
  const userId = authData.user.id

  const expiresAt = new Date(Date.now() + opts.expiresInMs).toISOString()
  const { error: userError } = await admin.from('users').insert({
    id: userId,
    organization_id: org.id,
    email,
    full_name: opts.fullName ?? 'E2E Temp Password Student',
    role: 'student',
    temp_password_expires_at: expiresAt,
  })
  if (userError) throw new Error(`createArmedTempPasswordStudent public: ${userError.message}`)

  await ensureConsentRecords(admin, userId)

  return { userId, email, orgId: org.id }
}

/** Reads `temp_password_expires_at` via service role — bypasses RLS for verification. */
export async function readTempPasswordExpiresAt(userId: string): Promise<string | null> {
  const admin = getAdminClient()
  const { data, error } = await admin
    .from('users')
    .select('temp_password_expires_at')
    .eq('id', userId)
    .maybeSingle<{ temp_password_expires_at: string | null }>()
  if (error) throw new Error(`readTempPasswordExpiresAt: ${error.message}`)
  return data?.temp_password_expires_at ?? null
}

/**
 * Soft-deletes every throwaway student created by `createArmedTempPasswordStudent`.
 *
 * Soft-delete only — NOT `auth.admin.deleteUser()`. Unlike the admin-created
 * fixtures in `admin-students.spec.ts` (which are only ever driven through the
 * admin UI, never sign in as themselves), these throwaway students actually
 * log in during the test, which writes `audit_events` rows keyed to their id.
 * `audit_events.actor_id REFERENCES users(id)` with no `ON DELETE` clause
 * (RESTRICT — audit_events is append-only, `docs/security.md` rule 5), so a
 * hard `auth.admin.deleteUser()` cascading into `public.users` always fails
 * with "Database error deleting user" once any audit event exists for that
 * user. Soft-delete is also the project rule regardless (`code-style.md`
 * rule 6) — never hard DELETE. Emails are unique per call
 * (`uniqueTempPasswordEmail`), so leaving the Auth user behind risks no
 * future collision.
 */
export async function cleanupTempPasswordStudents(): Promise<void> {
  const admin = getAdminClient()
  const { data: rows, error } = await admin
    .from('users')
    .select('id')
    .like('email', `${E2E_TEMP_PASSWORD_EMAIL_PREFIX}%`)
    .is('deleted_at', null)
  if (error) throw new Error(`cleanupTempPasswordStudents: ${error.message}`)
  if (!rows?.length) return

  const { data: softDeleted, error: softDeleteError } = await admin
    .from('users')
    .update({ deleted_at: new Date().toISOString() })
    .in(
      'id',
      rows.map((row) => row.id),
    )
    .is('deleted_at', null)
    .select('id')
  if (softDeleteError) throw new Error(`cleanupTempPasswordStudents: ${softDeleteError.message}`)
  if ((softDeleted?.length ?? 0) > 0) {
    console.log(`[cleanupTempPasswordStudents] soft-deleted ${softDeleted?.length} student(s)`)
  }
}
