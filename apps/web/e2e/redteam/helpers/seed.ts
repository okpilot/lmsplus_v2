import { getAdminClient } from '../../helpers/supabase'

export const ATTACKER_EMAIL = 'redteam-attacker@lmsplus.local'
export const VICTIM_EMAIL = 'redteam-victim@lmsplus.local'
export const ATTACKER_PASSWORD = 'redteam-attacker-2026!'
export const VICTIM_PASSWORD = 'redteam-victim-2026!'

const OTHER_ORG_SLUG = 'redteam-other-org'

export async function seedRedTeamUsers(): Promise<{
  attackerUserId: string
  victimUserId: string
  orgId: string
  otherOrgId: string
}> {
  const admin = getAdminClient()

  // Resolve egmont-aviation org
  const { data: org, error: orgError } = await admin
    .from('organizations')
    .select('id')
    .eq('slug', 'egmont-aviation')
    .single()
  if (orgError || !org) throw new Error(`Could not find egmont-aviation org: ${orgError?.message}`)
  const orgId = org.id

  // Create redteam-other-org (idempotent)
  const { data: existingOtherOrg } = await admin
    .from('organizations')
    .select('id')
    .eq('slug', OTHER_ORG_SLUG)
    .maybeSingle()

  let otherOrgId: string
  if (existingOtherOrg) {
    otherOrgId = existingOtherOrg.id
  } else {
    const { data: newOrg, error: newOrgError } = await admin
      .from('organizations')
      .insert({ name: 'Red Team Other Org', slug: OTHER_ORG_SLUG })
      .select('id')
      .single()
    if (newOrgError || !newOrg)
      throw new Error(`Could not create redteam-other-org: ${newOrgError?.message}`)
    otherOrgId = newOrg.id
  }

  // Create attacker user (idempotent)
  const attackerUserId = await upsertUser(admin, ATTACKER_EMAIL, ATTACKER_PASSWORD, orgId)

  // Create victim user (idempotent)
  const victimUserId = await upsertUser(admin, VICTIM_EMAIL, VICTIM_PASSWORD, orgId)

  return { attackerUserId, victimUserId, orgId, otherOrgId }
}

export async function createCrossOrgUser(): Promise<{
  userId: string
  orgId: string
  email: string
  password: string
}> {
  const admin = getAdminClient()

  const { data: otherOrg, error: otherOrgError } = await admin
    .from('organizations')
    .select('id')
    .eq('slug', OTHER_ORG_SLUG)
    .maybeSingle()
  if (otherOrgError) throw new Error(`Could not query redteam-other-org: ${otherOrgError.message}`)

  let orgId: string
  if (otherOrg) {
    orgId = otherOrg.id
  } else {
    const { data: newOrg, error: newOrgError } = await admin
      .from('organizations')
      .insert({ name: 'Red Team Other Org', slug: OTHER_ORG_SLUG })
      .select('id')
      .single()
    if (newOrgError || !newOrg)
      throw new Error(`Could not create redteam-other-org: ${newOrgError?.message}`)
    orgId = newOrg.id
  }

  const email = 'redteam-crossorg@lmsplus.local'
  const password = 'redteam-crossorg-2026!'
  const userId = await upsertUser(admin, email, password, orgId)

  return { userId, orgId, email, password }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function upsertUser(
  admin: ReturnType<typeof getAdminClient>,
  email: string,
  password: string,
  orgId: string,
): Promise<string> {
  // Check if auth user already exists
  const { data: list, error: listError } = await admin.auth.admin.listUsers()
  if (listError) throw new Error(`Could not list users: ${listError.message}`)

  const existing = list.users.find((u) => u.email === email)
  if (existing) {
    // Ensure public.users row exists (may have been cleaned up)
    const { data: userRow } = await admin
      .from('users')
      .select('id')
      .eq('id', existing.id)
      .maybeSingle()
    if (!userRow) {
      const { error: insertError } = await admin.from('users').insert({
        id: existing.id,
        organization_id: orgId,
        email,
        full_name: `Red Team ${email.split('@')[0]}`,
        role: 'student',
      })
      if (insertError)
        throw new Error(`Could not insert user row for ${email}: ${insertError.message}`)
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
    role: 'student',
  })
  if (insertError) throw new Error(`Could not insert user row for ${email}: ${insertError.message}`)

  return userId
}
