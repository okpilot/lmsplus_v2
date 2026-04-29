import { getAdminClient } from '../../helpers/supabase'

export const ATTACKER_EMAIL = 'redteam-attacker@lmsplus.local'
export const VICTIM_EMAIL = 'redteam-victim@lmsplus.local'
export const ATTACKER_PASSWORD = 'redteam-attacker-2026!'
export const VICTIM_PASSWORD = 'redteam-victim-2026!'

export const ADMIN_EMAIL = 'redteam-admin@lmsplus.local'
export const ADMIN_PASSWORD = 'redteam-admin-2026!'
export const CROSS_ORG_ADMIN_EMAIL = 'redteam-crossorg-admin@lmsplus.local'
export const CROSS_ORG_ADMIN_PASSWORD = 'redteam-crossorg-admin-2026!'

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
  const { data: org, error: orgError } = await admin
    .from('organizations')
    .select('id')
    .eq('slug', 'egmont-aviation')
    .single()
  if (orgError || !org) throw new Error(`Could not find egmont-aviation org: ${orgError?.message}`)
  const orgId = org.id

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
  const { data: existingOtherOrg } = await admin
    .from('organizations')
    .select('id')
    .eq('slug', OTHER_ORG_SLUG)
    .maybeSingle()

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

/**
 * Ensure an enabled exam_config (with at least one distribution row) exists for
 * (orgId, subjectId). Idempotent. Returns the exam_config id.
 *
 * Used by internal-exam red-team specs that exercise issue/start RPCs which
 * require an exam_config row to be present.
 */
export async function ensureExamConfig(
  orgId: string,
  subjectId: string,
  topicId: string,
): Promise<string> {
  const admin = getAdminClient()

  const { data: existing, error: existingError } = await admin
    .from('exam_configs')
    .select('id, enabled')
    .eq('organization_id', orgId)
    .eq('subject_id', subjectId)
    .is('deleted_at', null)
    .maybeSingle()
  if (existingError) throw new Error(`ensureExamConfig select: ${existingError.message}`)

  let configId: string
  if (existing) {
    configId = existing.id
    if (!existing.enabled) {
      const { error: enableError } = await admin
        .from('exam_configs')
        .update({ enabled: true })
        .eq('id', configId)
      if (enableError) throw new Error(`ensureExamConfig enable: ${enableError.message}`)
    }
  } else {
    const { data: created, error: createError } = await admin
      .from('exam_configs')
      .insert({
        organization_id: orgId,
        subject_id: subjectId,
        enabled: true,
        total_questions: 1,
        time_limit_seconds: 600,
        pass_mark: 75,
      })
      .select('id')
      .single()
    if (createError || !created) throw new Error(`ensureExamConfig insert: ${createError?.message}`)
    configId = created.id
  }

  // Ensure at least one distribution row.
  const { data: dist } = await admin
    .from('exam_config_distributions')
    .select('id')
    .eq('exam_config_id', configId)
    .limit(1)
  if (!dist || dist.length === 0) {
    const { error: distError } = await admin.from('exam_config_distributions').insert({
      exam_config_id: configId,
      topic_id: topicId,
      subtopic_id: null,
      question_count: 1,
    })
    if (distError) throw new Error(`ensureExamConfig distribution: ${distError.message}`)
  }

  return configId
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function upsertUser(
  admin: ReturnType<typeof getAdminClient>,
  email: string,
  password: string,
  orgId: string,
  role: 'student' | 'admin' = 'student',
): Promise<string> {
  // Check if auth user already exists
  const { data: list, error: listError } = await admin.auth.admin.listUsers()
  if (listError) throw new Error(`Could not list users: ${listError.message}`)

  const existing = list.users.find((u) => u.email === email)
  if (existing) {
    // Ensure public.users row exists (may have been cleaned up) AND has the
    // expected role + org. Re-running the helper across spec files must be
    // idempotent; a user that drifted (org changed, role demoted) gets fixed.
    const { data: userRow } = await admin
      .from('users')
      .select('id, organization_id, role')
      .eq('id', existing.id)
      .maybeSingle()
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
