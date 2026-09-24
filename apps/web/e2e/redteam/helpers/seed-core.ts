import { findAuthUserByEmail } from '../../helpers/auth-users'
import type { getAdminClient } from '../../helpers/supabase'

const OTHER_ORG_SLUG = 'redteam-other-org'

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

export async function upsertUser(
  admin: ReturnType<typeof getAdminClient>,
  email: string,
  password: string,
  orgId: string,
  role: 'student' | 'admin' | 'instructor' = 'student',
): Promise<string> {
  // Resolve the auth user id — reuse an existing one, else create it. Both the
  // lookup and the create can lose a race to a parallel worker, so a
  // duplicate-email createUser failure means "another worker already made it":
  // re-fetch instead of crashing.
  const existing = await findAuthUserByEmail(admin, email)
  let userId: string
  if (existing) {
    userId = existing.id
  } else {
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (createError || !created?.user) {
      const raced = await findAuthUserByEmail(admin, email)
      if (!raced) {
        const reason = createError ? `: ${createError.message}` : ' (create returned no user)'
        throw new Error(`Could not create or find auth user ${email}${reason}`)
      }
      userId = raced.id
    } else {
      userId = created.user.id
    }
  }

  // Idempotently converge the public.users row via an upsert on the PK id, so
  // parallel workers can't race an insert into a duplicate-key failure and a
  // drifted org/role is realigned. deleted_at is intentionally NOT in the
  // payload: the EN/EO soft-delete throwaway students must stay soft-deleted.
  const { error: upsertError } = await admin.from('users').upsert(
    {
      id: userId,
      organization_id: orgId,
      email,
      full_name: `Red Team ${email.split('@')[0]}`,
      role,
    },
    { onConflict: 'id' },
  )
  if (upsertError) throw new Error(`Could not upsert user row for ${email}: ${upsertError.message}`)

  return userId
}
