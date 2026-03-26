import { createServerSupabaseClient } from '@repo/db/server'

export type ProfileData = {
  fullName: string | null
  email: string
  organizationName: string | null
  memberSince: string
  stats: ProfileStats
}

export type ProfileStats = {
  totalSessions: number
  averageScore: number
  totalAnswered: number
}

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

export async function getProfileData(): Promise<ProfileData> {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError) throw new Error(`Auth error: ${authError.message}`)
  if (!user) throw new Error('Not authenticated')

  const [profile, stats] = await Promise.all([
    getProfile(supabase, user.id),
    getProfileStats(supabase, user.id),
  ])

  return {
    fullName: profile.fullName,
    email: profile.email,
    organizationName: profile.organizationName,
    memberSince: profile.memberSince,
    stats,
  }
}

type ProfileRow = {
  full_name: string | null
  email: string
  created_at: string
  organization_id: string
}

type OrgRow = { name: string }

async function getProfile(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from('users')
    .select('full_name, email, created_at, organization_id')
    .eq('id', userId)
    .single<ProfileRow>()

  if (error || !data) throw new Error('Failed to load profile')

  const { data: org } = await supabase
    .from('organizations')
    .select('name')
    .eq('id', data.organization_id)
    .single<OrgRow>()

  return {
    fullName: data.full_name,
    email: data.email,
    memberSince: data.created_at,
    organizationName: org?.name ?? null,
  }
}

type SessionRow = { score_percentage: number | null }

async function getProfileStats(supabase: SupabaseClient, userId: string): Promise<ProfileStats> {
  const { data: sessions } = await supabase
    .from('quiz_sessions')
    .select('score_percentage')
    .eq('student_id', userId)
    .not('ended_at', 'is', null)
    .is('deleted_at', null)

  const completed = ((sessions ?? []) as SessionRow[]).filter((s) => s.score_percentage !== null)

  const totalSessions = completed.length
  const averageScore =
    totalSessions > 0
      ? Math.round(completed.reduce((sum, s) => sum + (s.score_percentage ?? 0), 0) / totalSessions)
      : 0

  const { count } = await supabase
    .from('student_responses')
    .select('*', { count: 'exact', head: true })
    .eq('student_id', userId)

  return {
    totalSessions,
    averageScore,
    totalAnswered: count ?? 0,
  }
}
