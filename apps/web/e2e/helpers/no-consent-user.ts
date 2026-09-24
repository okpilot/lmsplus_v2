import { getAdminClient } from './supabase'

type NoConsentUser = { email: string; password: string; fullName: string }

/**
 * Creates (or resets) a student in the Egmont Aviation org WITHOUT consent
 * records, so the consent gate fires on the next login. Returns the user id.
 */
export async function ensureNoConsentUser(user: NoConsentUser): Promise<string> {
  const admin = getAdminClient()
  const { data: org, error: orgError } = await admin
    .from('organizations')
    .select('id')
    .eq('slug', 'egmont-aviation')
    .single()
  if (orgError || !org) throw new Error(`ensureNoConsentUser org lookup: ${orgError?.message}`)

  const userId = await upsertAuthUser(admin, user)
  await upsertPublicUser(admin, { userId, orgId: org.id, user })
  return userId
}

async function upsertAuthUser(
  admin: ReturnType<typeof getAdminClient>,
  user: NoConsentUser,
): Promise<string> {
  const { data: existingUsers, error: listError } = await admin.auth.admin.listUsers()
  if (listError) throw new Error(`ensureNoConsentUser listUsers: ${listError.message}`)
  const existing = existingUsers?.users.find((u: { email?: string }) => u.email === user.email)

  if (!existing) {
    const { data, error } = await admin.auth.admin.createUser({
      email: user.email,
      password: user.password,
      email_confirm: true,
    })
    if (error) throw new Error(`ensureNoConsentUser auth: ${error.message}`)
    return data.user.id
  }

  const { error: resetError } = await admin.auth.admin.updateUserById(existing.id, {
    password: user.password,
  })
  if (resetError) throw new Error(`ensureNoConsentUser reset password: ${resetError.message}`)
  // Remove any existing consent records so the gate fires on every run
  const { error: deleteError } = await admin
    .from('user_consents')
    .delete()
    .eq('user_id', existing.id)
  if (deleteError) {
    console.error('[ensureNoConsentUser] Failed to clear consents:', deleteError.message)
  }
  return existing.id
}

async function upsertPublicUser(
  admin: ReturnType<typeof getAdminClient>,
  opts: { userId: string; orgId: string; user: NoConsentUser },
): Promise<void> {
  const { userId, orgId, user } = opts
  const { data: userRow, error: userRowError } = await admin
    .from('users')
    .select('id, organization_id')
    .eq('id', userId)
    .single()
  if (userRowError && userRowError.code !== 'PGRST116') {
    throw new Error(`ensureNoConsentUser user lookup: ${userRowError.message}`)
  }

  if (!userRow) {
    const { error } = await admin.from('users').insert({
      id: userId,
      organization_id: orgId,
      email: user.email,
      full_name: user.fullName,
      role: 'student',
    })
    if (error) throw new Error(`ensureNoConsentUser public: ${error.message}`)
  } else if (userRow.organization_id !== orgId) {
    const { error } = await admin.from('users').update({ organization_id: orgId }).eq('id', userId)
    if (error) throw new Error(`ensureNoConsentUser update org: ${error.message}`)
  }
}

/**
 * afterAll cleanup: deletes the user's consent records (accumulated — they WOULD
 * leak into the next run), then best-effort deletes the auth user. That delete
 * cannot fully succeed: immutable audit_events FK references (security rule 5)
 * pin the user, and the email is reused across runs, so a lingering user is not
 * a cross-spec state leak.
 */
export async function removeNoConsentUser(email: string): Promise<void> {
  const admin = getAdminClient()
  const errors: string[] = []

  let authUser: { id: string; email?: string } | undefined
  try {
    const { data: existingUsers, error: listError } = await admin.auth.admin.listUsers()
    if (listError) throw new Error(`afterAll listUsers: ${listError.message}`)
    authUser = existingUsers?.users.find((u: { email?: string }) => u.email === email)
    if (!authUser) console.warn('[afterAll] no-consent user not found:', email)
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e))
  }

  if (authUser) {
    try {
      const { error } = await admin.from('user_consents').delete().eq('user_id', authUser.id)
      if (error) throw new Error(`afterAll delete consent records: ${error.message}`)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    const { error: deleteUserError } = await admin.auth.admin.deleteUser(authUser.id)
    if (deleteUserError) {
      console.error('[afterAll] best-effort auth-user delete failed:', deleteUserError.message)
    }
  }

  if (errors.length > 0) throw new Error(`afterAll: ${errors.join('; ')}`)
}
