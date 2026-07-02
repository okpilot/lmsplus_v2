import { getAdminClient } from '../../helpers/supabase'
import { getEgmontOrgId, OTHER_ORG_SLUG, upsertUser } from './seed-core'

export const ATTACKER_EMAIL = 'redteam-attacker@lmsplus.local'
export const VICTIM_EMAIL = 'redteam-victim@lmsplus.local'
export const ATTACKER_PASSWORD = 'redteam-attacker-2026!'
export const VICTIM_PASSWORD = 'redteam-victim-2026!'

export const ADMIN_EMAIL = 'redteam-admin@lmsplus.local'
export const ADMIN_PASSWORD = 'redteam-admin-2026!'
const CROSS_ORG_ADMIN_EMAIL = 'redteam-crossorg-admin@lmsplus.local'
const CROSS_ORG_ADMIN_PASSWORD = 'redteam-crossorg-admin-2026!'

export async function seedRedTeamUsers(): Promise<{
  attackerUserId: string
  victimUserId: string
  orgId: string
  otherOrgId: string
}> {
  const admin = getAdminClient()

  const orgId = await getEgmontOrgId(admin)

  // Create redteam-other-org (idempotent)
  const { data: existingOtherOrg, error: existingOtherOrgErr } = await admin
    .from('organizations')
    .select('id')
    .eq('slug', OTHER_ORG_SLUG)
    .maybeSingle()
  if (existingOtherOrgErr)
    throw new Error(`seedRedTeamUsers: org lookup failed: ${existingOtherOrgErr.message}`)

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

/**
 * Ensure an admin user exists in the egmont-aviation org.
 * Used by internal-exam red-team specs that need to call admin-only RPCs.
 */
export async function seedRedTeamAdmin(): Promise<{
  adminUserId: string
  orgId: string
  email: string
  password: string
}> {
  const admin = getAdminClient()
  const orgId = await getEgmontOrgId(admin)

  const adminUserId = await upsertUser(admin, ADMIN_EMAIL, ADMIN_PASSWORD, orgId, 'admin')
  return { adminUserId, orgId, email: ADMIN_EMAIL, password: ADMIN_PASSWORD }
}

/**
 * Ensure an admin user exists in the OTHER (cross-org) org.
 * Used to test cross-org admin paths (e.g. void_internal_exam_code with foreign org code).
 */
export async function seedCrossOrgAdmin(): Promise<{
  adminUserId: string
  orgId: string
  email: string
  password: string
}> {
  const admin = getAdminClient()
  const { data: existingOtherOrg, error: existingOtherOrgErr } = await admin
    .from('organizations')
    .select('id')
    .eq('slug', OTHER_ORG_SLUG)
    .maybeSingle()
  if (existingOtherOrgErr)
    throw new Error(`seedCrossOrgAdmin: org lookup failed: ${existingOtherOrgErr.message}`)

  let orgId: string
  if (existingOtherOrg) {
    orgId = existingOtherOrg.id
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

  const adminUserId = await upsertUser(
    admin,
    CROSS_ORG_ADMIN_EMAIL,
    CROSS_ORG_ADMIN_PASSWORD,
    orgId,
    'admin',
  )
  return { adminUserId, orgId, email: CROSS_ORG_ADMIN_EMAIL, password: CROSS_ORG_ADMIN_PASSWORD }
}

// Module-private instructor creds — not exported; callers receive them via the
// return value of seedRedTeamInstructor() (Req 5.1).
const INSTRUCTOR_EMAIL = 'redteam-instructor@lmsplus.local'
const INSTRUCTOR_PASSWORD = 'redteam-instructor-2026!'

/**
 * Ensure an instructor user exists in the egmont-aviation org (zero responses).
 * Mirrors seedRedTeamAdmin exactly, using the instructor role.
 * Returns the credentials so a spec can sign in without importing module-private consts.
 */
export async function seedRedTeamInstructor(): Promise<{
  instructorUserId: string
  orgId: string
  email: string
  password: string
}> {
  const admin = getAdminClient()
  const orgId = await getEgmontOrgId(admin)

  const instructorUserId = await upsertUser(
    admin,
    INSTRUCTOR_EMAIL,
    INSTRUCTOR_PASSWORD,
    orgId,
    'instructor',
  )
  return { instructorUserId, orgId, email: INSTRUCTOR_EMAIL, password: INSTRUCTOR_PASSWORD }
}

/**
 * Expose the egmont victim student credentials for sign-in.
 * Idempotent: upsertUser is a no-op if the user already exists.
 * Returns the credentials so a spec can authenticate as the victim
 * without importing VICTIM_EMAIL/VICTIM_PASSWORD directly.
 */
export async function seedRedTeamStudent(): Promise<{
  victimUserId: string
  orgId: string
  email: string
  password: string
}> {
  const admin = getAdminClient()
  const orgId = await getEgmontOrgId(admin)

  const victimUserId = await upsertUser(admin, VICTIM_EMAIL, VICTIM_PASSWORD, orgId)
  return { victimUserId, orgId, email: VICTIM_EMAIL, password: VICTIM_PASSWORD }
}
