import { randomUUID } from 'node:crypto'
import { findAuthUserByEmail } from './auth-users'
import { ensureConsentRecords, getAdminClient } from './supabase'

/** Marker prefix for throwaway students created by the set-password-link specs. */
export const E2E_SET_PASSWORD_LINK_EMAIL_PREFIX = 'e2e-set-password-link-'
const E2E_SET_PASSWORD_LINK_DOMAIN = '@lmsplus.local'
const PENDING_MARKER_TTL_MS = 7 * 24 * 60 * 60 * 1000

function slotEmail(slot: string): string {
  return `${E2E_SET_PASSWORD_LINK_EMAIL_PREFIX}${slot}${E2E_SET_PASSWORD_LINK_DOMAIN}`
}

type LinkStudent = { userId: string; email: string; orgId: string }
type AdminClient = ReturnType<typeof getAdminClient>

/**
 * Finds the slot's Auth user, or creates one with no password (as admin
 * create-student does). A reused slot user keeps the password a previous run
 * set, which Auth would reject as `same_password`; it is replaced with a random
 * one nobody knows.
 */
async function upsertPasswordlessAuthUser(admin: AdminClient, email: string): Promise<string> {
  const existing = await findAuthUserByEmail(admin, email)
  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      password: `${randomUUID()}${randomUUID()}`,
    })
    if (error) throw new Error(`createLinkStudent password reset: ${error.message}`)
    return existing.id
  }

  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true })
  if (error || !data?.user) throw new Error(`createLinkStudent auth: ${error?.message}`)
  return data.user.id
}

/** Re-arms (or creates) the `public.users` row for a slot user, undeleting it if needed. */
async function upsertPendingUserRow(opts: {
  admin: AdminClient
  userId: string
  orgId: string
  email: string
  fullName?: string
}): Promise<void> {
  const { admin, userId, orgId, email, fullName } = opts
  const { error } = await admin.from('users').upsert({
    id: userId,
    organization_id: orgId,
    email,
    full_name: fullName ?? 'E2E Set Password Link Student',
    role: 'student',
    deleted_at: null,
    login_instructions_sent_at: new Date().toISOString(),
    temp_password_expires_at: new Date(Date.now() + PENDING_MARKER_TTL_MS).toISOString(),
  })
  if (error) throw new Error(`createLinkStudent public: ${error.message}`)
}

/** Removes consent rows so the consent gate fires on the next login. */
async function clearConsentRecords(admin: AdminClient, userId: string): Promise<void> {
  const { error } = await admin.from('user_consents').delete().eq('user_id', userId)
  if (error) throw new Error(`createLinkStudent clear consents: ${error.message}`)
}

/**
 * Arms a dedicated throwaway student in the Egmont Aviation org, identified by
 * a caller-chosen `slot` (deterministic email — reused across runs, never
 * leaking a fresh Auth user per call). The row carries the pending marker
 * (`temp_password_expires_at` non-null = "login instructions sent, own password
 * not set"). `consented: false` removes the consent records so the consent
 * gate fires after the password is set.
 *
 * Each call site must pass its own unique `slot` literal — two call sites
 * sharing a slot collide under parallel Playwright workers.
 */
export async function createLinkStudent(opts: {
  slot: string
  fullName?: string
  consented?: boolean
}): Promise<LinkStudent> {
  const admin = getAdminClient()
  const email = slotEmail(opts.slot)

  const { data: org, error: orgError } = await admin
    .from('organizations')
    .select('id')
    .eq('slug', 'egmont-aviation')
    .single()
  if (orgError || !org) throw new Error(`createLinkStudent org lookup: ${orgError?.message}`)

  const userId = await upsertPasswordlessAuthUser(admin, email)
  await upsertPendingUserRow({ admin, userId, orgId: org.id, email, fullName: opts.fullName })

  if (opts.consented === false) {
    await clearConsentRecords(admin, userId)
  } else {
    await ensureConsentRecords(admin, userId)
  }

  return { userId, email, orgId: org.id }
}

/**
 * Issues a set-password link exactly as the admin send flow does:
 * service-role `generateLink({ type: 'recovery' })`, no email sent. Returns the
 * app-relative path (use with `page.goto`) and the raw token hash. A second
 * call for the same email rotates the token and voids the first link.
 */
export async function issueSetPasswordLink(
  email: string,
): Promise<{ path: string; tokenHash: string }> {
  const { data, error } = await getAdminClient().auth.admin.generateLink({
    type: 'recovery',
    email,
  })
  if (error) throw new Error(`issueSetPasswordLink: ${error.message}`)
  const tokenHash = data?.properties?.hashed_token
  if (!tokenHash) throw new Error('issueSetPasswordLink: no hashed_token on generateLink response')
  const params = new URLSearchParams({ token_hash: tokenHash, type: 'recovery' })
  return { path: `/auth/set-password?${params.toString()}`, tokenHash }
}

/** Reads `temp_password_expires_at` via service role — bypasses RLS for verification. */
export async function readPendingMarker(userId: string): Promise<string | null> {
  const { data, error } = await getAdminClient()
    .from('users')
    .select('temp_password_expires_at')
    .eq('id', userId)
    .maybeSingle<{ temp_password_expires_at: string | null }>()
  if (error) throw new Error(`readPendingMarker: ${error.message}`)
  return data?.temp_password_expires_at ?? null
}

/** Soft-deletes one student (simulates an admin deactivating the account). */
export async function softDeleteLinkStudent(userId: string): Promise<void> {
  const { data, error } = await getAdminClient()
    .from('users')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', userId)
    .is('deleted_at', null)
    .select('id')
  if (error) throw new Error(`softDeleteLinkStudent: ${error.message}`)
  if (!data?.length) throw new Error(`softDeleteLinkStudent: no live row for ${userId}`)
}

/**
 * Soft-deletes every throwaway student created by `createLinkStudent`.
 *
 * Soft-delete only — NOT `auth.admin.deleteUser()`: these students sign in,
 * which writes `audit_events` rows keyed to their id
 * (`audit_events.actor_id REFERENCES users(id)`, RESTRICT, append-only —
 * `docs/security.md` rule 5), so a hard delete always fails. Slot emails are
 * deterministic, so the next `createLinkStudent` reuses the Auth user and
 * undeletes the row; nothing leaks.
 */
export async function cleanupLinkStudents(): Promise<void> {
  const admin = getAdminClient()
  const { data: rows, error } = await admin
    .from('users')
    .select('id')
    .like('email', `${E2E_SET_PASSWORD_LINK_EMAIL_PREFIX}%`)
    .is('deleted_at', null)
  if (error) throw new Error(`cleanupLinkStudents: list: ${error.message}`)
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
  if (softDeleteError)
    throw new Error(`cleanupLinkStudents: soft-delete: ${softDeleteError.message}`)
  if ((softDeleted?.length ?? 0) > 0) {
    console.log(`[cleanupLinkStudents] soft-deleted ${softDeleted?.length} student(s)`)
  }
}
