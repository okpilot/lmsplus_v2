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

export async function upsertUser(
  admin: ReturnType<typeof getAdminClient>,
  email: string,
  password: string,
  orgId: string,
  role: 'student' | 'admin' | 'instructor' = 'student',
): Promise<string> {
  // Check if auth user already exists
  const { data: list, error: listError } = await admin.auth.admin.listUsers()
  if (listError) throw new Error(`Could not list users: ${listError.message}`)

  const existing = list.users.find((u) => u.email === email)
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
