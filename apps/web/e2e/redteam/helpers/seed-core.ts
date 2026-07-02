import type { getAdminClient } from '../../helpers/supabase'

export const OTHER_ORG_SLUG = 'redteam-other-org'

/** Resolve the egmont-aviation org id, throwing loudly if absent. */
export async function getEgmontOrgId(admin: ReturnType<typeof getAdminClient>): Promise<string> {
  const { data: org, error } = await admin
    .from('organizations')
    .select('id')
    .eq('slug', 'egmont-aviation')
    .single()
  if (error || !org) throw new Error(`Could not find egmont-aviation org: ${error?.message}`)
  return org.id
}

/**
 * Resolve (or atomically create) the redteam-other-org used by cross-org specs.
 * Uses an idempotent upsert on the UNIQUE `slug` column so parallel Playwright
 * workers can't race a check-then-insert into a duplicate-key crash.
 */
export async function getOrCreateOtherOrg(
  admin: ReturnType<typeof getAdminClient>,
): Promise<string> {
  const { data, error } = await admin
    .from('organizations')
    // deleted_at: null un-soft-deletes the row if a prior teardown ever removed
    // it (slug's UNIQUE is non-partial, so a soft-deleted row still holds the slot).
    .upsert(
      { name: 'Red Team Other Org', slug: OTHER_ORG_SLUG, deleted_at: null },
      { onConflict: 'slug' },
    )
    .select('id')
    .single()
  if (error || !data) throw new Error(`Could not upsert redteam-other-org: ${error?.message}`)
  return data.id
}

/**
 * Find an auth user by email, paging through the full admin list. The admin API
 * returns 50 users/page by default; the shared red-team project accumulates
 * users across dozens of specs, so a single unpaginated listUsers() would miss
 * any email past page 1 — the caller would then re-create it and hit an
 * "already registered" error. Pages until the email is found or exhausted.
 */
const AUTH_USERS_PER_PAGE = 200

async function findAuthUserByEmail(admin: ReturnType<typeof getAdminClient>, email: string) {
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: AUTH_USERS_PER_PAGE })
    if (error) throw new Error(`Could not list users: ${error.message}`)
    const match = data.users.find((u) => u.email === email)
    if (match) return match
    if (data.users.length < AUTH_USERS_PER_PAGE) return undefined
  }
}

export async function upsertUser(
  admin: ReturnType<typeof getAdminClient>,
  email: string,
  password: string,
  orgId: string,
  role: 'student' | 'admin' | 'instructor' = 'student',
): Promise<string> {
  // Check if auth user already exists (paginated — see findAuthUserByEmail).
  const existing = await findAuthUserByEmail(admin, email)
  if (existing) {
    // Ensure public.users row exists (may have been cleaned up) AND has the
    // expected role + org. Re-running the helper across spec files must be
    // idempotent; a user that drifted (org changed, role demoted) gets fixed.
    const { data: userRow, error: userRowErr } = await admin
      .from('users')
      .select('id, organization_id, role')
      .eq('id', existing.id)
      .maybeSingle()
    if (userRowErr) throw new Error(`upsertUser: users lookup failed: ${userRowErr.message}`)
    if (!userRow) {
      const { error: insertError } = await admin.from('users').insert({
        id: existing.id,
        organization_id: orgId,
        email,
        full_name: `Red Team ${email.split('@')[0]}`,
        role,
      })
      if (insertError)
        throw new Error(`Could not insert user row for ${email}: ${insertError.message}`)
    } else if (userRow.organization_id !== orgId || userRow.role !== role) {
      const { error: updateError } = await admin
        .from('users')
        .update({ organization_id: orgId, role })
        .eq('id', existing.id)
      if (updateError)
        throw new Error(`Could not realign user row for ${email}: ${updateError.message}`)
    }
    return existing.id
  }

  // Create auth user
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (createError || !created.user)
    throw new Error(`Could not create auth user ${email}: ${createError?.message}`)

  const userId = created.user.id

  // Insert into users table
  const { error: insertError } = await admin.from('users').insert({
    id: userId,
    organization_id: orgId,
    email,
    full_name: `Red Team ${email.split('@')[0]}`,
    role,
  })
  if (insertError) throw new Error(`Could not insert user row for ${email}: ${insertError.message}`)

  return userId
}
