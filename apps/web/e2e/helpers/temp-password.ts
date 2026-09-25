import { findAuthUserByEmail } from './auth-users'
import { ensureConsentRecords, getAdminClient } from './supabase'

/** Marker prefix for throwaway students created by the temp-password specs. */
export const E2E_TEMP_PASSWORD_EMAIL_PREFIX = 'e2e-temp-password-'
const E2E_TEMP_PASSWORD_DOMAIN = '@lmsplus.local'

function slotEmail(slot: string): string {
  return `${E2E_TEMP_PASSWORD_EMAIL_PREFIX}${slot}${E2E_TEMP_PASSWORD_DOMAIN}`
}

type ArmedStudent = { userId: string; email: string; orgId: string }
type AdminClient = ReturnType<typeof getAdminClient>

/** Resets the Auth password for an existing slot user, or creates a fresh one. */
async function upsertArmedAuthUser(
  admin: AdminClient,
  email: string,
  password: string,
): Promise<string> {
  const existing = await findAuthUserByEmail(admin, email)
  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, { password })
    if (error) throw new Error(`createArmedTempPasswordStudent reset: ${error.message}`)
    return existing.id
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error || !data?.user) {
    throw new Error(`createArmedTempPasswordStudent auth: ${error?.message}`)
  }
  return data.user.id
}

/** Re-arms (or creates) the `public.users` row for a slot user, undeleting it if needed. */
async function upsertArmedUserRow(opts: {
  admin: AdminClient
  userId: string
  orgId: string
  email: string
  expiresAt: string
  fullName?: string
}): Promise<void> {
  const { admin, userId, orgId, email, expiresAt, fullName } = opts
  const { error } = await admin.from('users').upsert({
    id: userId,
    organization_id: orgId,
    email,
    full_name: fullName ?? 'E2E Temp Password Student',
    role: 'student',
    deleted_at: null,
    temp_password_expires_at: expiresAt,
  })
  if (error) throw new Error(`createArmedTempPasswordStudent public: ${error.message}`)
}

/**
 * Arms a dedicated throwaway student in the Egmont Aviation org, identified by
 * a caller-chosen `slot` (deterministic email — reused across runs, never
 * leaking a fresh Auth user per call), sets their Auth password via service
 * role, and arms `temp_password_expires_at` at `Date.now() + expiresInMs` — a
 * negative `expiresInMs` arms an already-expired account. Seeds consent
 * records so the consent gate never masks the temp-password gate under test.
 *
 * Each call site must pass its own unique `slot` literal — two call sites
 * sharing a slot collide under parallel Playwright workers.
 */
export async function createArmedTempPasswordStudent(opts: {
  slot: string
  password: string
  expiresInMs: number
  fullName?: string
}): Promise<ArmedStudent> {
  const admin = getAdminClient()
  const email = slotEmail(opts.slot)

  const { data: org, error: orgError } = await admin
    .from('organizations')
    .select('id')
    .eq('slug', 'egmont-aviation')
    .single()
  if (orgError || !org) {
    throw new Error(`createArmedTempPasswordStudent org lookup: ${orgError?.message}`)
  }

  const userId = await upsertArmedAuthUser(admin, email, opts.password)
  const expiresAt = new Date(Date.now() + opts.expiresInMs).toISOString()
  await upsertArmedUserRow({
    admin,
    userId,
    orgId: org.id,
    email,
    expiresAt,
    fullName: opts.fullName,
  })

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
 * rule 6) — never hard DELETE. Emails are deterministic per slot, not unique
 * per call — `createArmedTempPasswordStudent` reuses the same Auth user on
 * its next call for that slot, so the underlying Auth user is never
 * recreated and never leaked.
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
