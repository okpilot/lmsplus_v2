import { createServerSupabaseClient } from '@repo/db/server'
import { getCallerProfile } from '@/lib/auth/get-caller-profile'
import { getSessionUser } from '@/lib/auth/get-session-user'

export type ProfileData = {
  fullName: string | null
  email: string
  organizationName: string | null
  memberSince: string
}

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

export async function getProfileData(): Promise<ProfileData> {
  const supabase = await createServerSupabaseClient()
  const user = await getSessionUser()
  if (!user) throw new Error('Not authenticated')

  return getProfile(supabase, user.id)
}

type OrgRow = { name: string }

async function getProfile(supabase: SupabaseClient, userId: string) {
  const { data, error } = await getCallerProfile(userId)

  if (error) throw new Error(`Failed to load profile: ${error.message}`)
  if (!data) throw new Error('Failed to load profile')

  // Org name is a non-critical display field (nullable). Unlike the page-critical
  // reads above, an org lookup failure logs + degrades to `organizationName: null`
  // rather than throwing — a missing org must not break the whole profile page.
  // PGRST116 (org soft-deleted → no row after the deleted_at filter) is a valid
  // empty state, not an error, so it is exempt from the log.
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('name')
    .eq('id', data.organization_id)
    .is('deleted_at', null)
    .single<OrgRow>()
  if (orgError && orgError.code !== 'PGRST116')
    console.error('[getProfile] org lookup error:', orgError.message)

  return {
    fullName: data.full_name,
    email: data.email,
    memberSince: data.created_at,
    organizationName: org?.name ?? null,
  }
}
