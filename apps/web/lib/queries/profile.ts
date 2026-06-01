import { createServerSupabaseClient } from '@repo/db/server'
import { rpc } from '@/lib/supabase-rpc'

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

// Postgres serializes numeric AVG (and bigint COUNT) as JSON strings, so accept both.
type ProfileStatsRow = { total_sessions: number | string; avg_score: number | string | null }

async function getProfileStats(supabase: SupabaseClient, userId: string): Promise<ProfileStats> {
  // Completed-session count + average score aggregated in Postgres (#668 P2): the prior
  // client read fetched every session's score_percentage and counted/averaged in JS, which
  // truncated at the PostgREST 1000-row cap for high-volume students. The RPC self-scopes to
  // the caller (quiz_sessions is multi-permissive, security.md §11).
  const { data: statsData, error: statsError } = await rpc<ProfileStatsRow[]>(
    supabase,
    'get_student_profile_stats',
    {},
  )
  if (statsError) {
    throw new Error(`Failed to fetch profile stats: ${statsError.message}`)
  }

  // rpc() casts the payload without validating shape — guard the array per code-style §5.
  const row = Array.isArray(statsData) ? statsData[0] : undefined
  const totalSessions = Number(row?.total_sessions ?? 0)
  // avg_score is the raw numeric mean; Math.round stays here to preserve the legacy rounding.
  const averageScore =
    totalSessions > 0 && row?.avg_score != null ? Math.round(Number(row.avg_score)) : 0

  // `userId` is only needed here: the head-count of answered questions is a safe
  // count (no truncation). The stats RPC above takes no args and self-scopes via auth.uid().
  const { count, error: countError } = await supabase
    .from('student_responses')
    .select('*', { count: 'exact', head: true })
    .eq('student_id', userId)
  if (countError) {
    throw new Error(`Failed to fetch answered count: ${countError.message}`)
  }

  return {
    totalSessions,
    averageScore,
    totalAnswered: count ?? 0,
  }
}
