import { adminClient } from '@repo/db/admin'
import { requireAdmin } from '@/lib/auth/require-admin'
import type {
  DashboardFilters,
  DashboardKpis,
  DashboardStudent,
  RecentSession,
  TimeRange,
  WeakTopic,
} from './types'

import { PAGE_SIZE } from './types'

// RPC calls use the authenticated client (not adminClient) so auth.uid() is set in Postgres.
// adminClient (service role) sets auth.uid() = NULL, which would fail the RPCs' auth check.
// Cast needed: RPC names not yet in generated types resolve to `never`.
type RpcFn = (
  fn: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>

function authRpc(supabase: { rpc: unknown }): RpcFn {
  return (supabase as unknown as { rpc: RpcFn }).rpc.bind(supabase)
}

function rangeToDays(range: TimeRange): number {
  const map: Record<TimeRange, number> = { '7d': 7, '30d': 30, '90d': 90, all: 0 }
  return map[range]
}

function rangeToCutoff(range: TimeRange): string | null {
  if (range === 'all') return null
  const days = rangeToDays(range)
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  return cutoff.toISOString()
}

export async function getDashboardKpis(range: TimeRange): Promise<DashboardKpis> {
  const { supabase } = await requireAdmin()

  const { data, error } = await authRpc(supabase)('get_admin_dashboard_kpis', {
    p_range_days: rangeToDays(range),
  })

  if (error) {
    console.error('[getDashboardKpis] RPC error:', error.message)
    throw new Error('Failed to fetch dashboard KPIs')
  }

  const json = (data ?? {}) as Record<string, unknown>
  return {
    activeStudents: (json.activeStudents as number) ?? 0,
    totalStudents: (json.totalStudents as number) ?? 0,
    avgMastery: (json.avgMastery as number) ?? 0,
    sessionsThisPeriod: (json.sessionsThisPeriod as number) ?? 0,
    weakestSubject: json.weakestSubject
      ? (json.weakestSubject as { name: string; short: string; avgMastery: number })
      : null,
    examReadyStudents: (json.examReadyStudents as number) ?? 0,
  }
}

// Merges RPC stats with user data, sorts + paginates in TypeScript.
// Pragmatic for typical org size (10-50 students). For 500+ students, refactor to SQL.
export async function getDashboardStudents(
  filters: DashboardFilters,
): Promise<{ students: DashboardStudent[]; totalCount: number }> {
  const { supabase, organizationId } = await requireAdmin()

  // RPC derives org from auth.uid() internally — no org param needed
  const { data: statsData, error: statsError } = await authRpc(supabase)('get_admin_student_stats')
  if (statsError) {
    console.error('[getDashboardStudents] Stats RPC error:', statsError.message)
    throw new Error('Failed to fetch student stats')
  }

  let query = adminClient
    .from('users')
    .select('id, full_name, email, last_active_at, deleted_at')
    .eq('organization_id', organizationId)
    .eq('role', 'student')

  // "All" (status undefined) shows both active and inactive students.
  // "active" filters to non-deleted; "inactive" filters to soft-deleted only.
  if (filters.status === 'active') {
    query = query.is('deleted_at', null)
  } else if (filters.status === 'inactive') {
    query = query.not('deleted_at', 'is', null)
  }

  const { data: usersData, error: usersError } = await query
  if (usersError) {
    console.error('[getDashboardStudents] Users query error:', usersError.message)
    throw new Error('Failed to fetch students')
  }

  type StatRow = {
    user_id: string
    session_count: number
    avg_score: number | null
    mastery: number
  } // prettier-ignore
  const statsRows = Array.isArray(statsData) ? (statsData as StatRow[]) : []
  const statsMap = new Map<string, StatRow>()
  for (const s of statsRows) {
    statsMap.set(s.user_id, s)
  }

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const merged: DashboardStudent[] = (usersData ?? []).map((u) => {
    const stats = statsMap.get(u.id)
    return {
      id: u.id,
      fullName: u.full_name,
      email: u.email,
      lastActiveAt: u.last_active_at,
      sessionCount: stats?.session_count ?? 0,
      avgScore: stats?.avg_score ?? null,
      mastery: stats?.mastery ?? 0,
      isActive: u.deleted_at === null,
      hasRecentActivity: u.last_active_at
        ? new Date(u.last_active_at).getTime() > sevenDaysAgo
        : false,
    }
  })

  const dir = filters.dir === 'desc' ? -1 : 1
  merged.sort((a, b) => {
    switch (filters.sort) {
      case 'name':
        return dir * (a.fullName ?? '').localeCompare(b.fullName ?? '')
      case 'lastActive': {
        if (a.lastActiveAt === null && b.lastActiveAt === null) return 0
        if (a.lastActiveAt === null) return 1
        if (b.lastActiveAt === null) return -1
        return dir * a.lastActiveAt.localeCompare(b.lastActiveAt)
      }
      case 'sessions':
        return dir * (a.sessionCount - b.sessionCount)
      case 'avgScore':
        return dir * ((a.avgScore ?? -1) - (b.avgScore ?? -1))
      case 'mastery':
        return dir * (a.mastery - b.mastery)
      default:
        return 0
    }
  })

  const totalCount = merged.length
  const start = (filters.page - 1) * PAGE_SIZE
  const students = merged.slice(start, start + PAGE_SIZE)

  return { students, totalCount }
}

export async function getWeakTopics(): Promise<WeakTopic[]> {
  const { supabase } = await requireAdmin()

  const { data, error } = await authRpc(supabase)('get_admin_weak_topics', { p_limit: 10 })
  if (error) {
    console.error('[getWeakTopics] RPC error:', error.message)
    throw new Error('Failed to fetch weak topics')
  }

  const rows = Array.isArray(data)
    ? (data as Array<{
        topic_id: string
        topic_name: string
        subject_name: string
        subject_short: string
        avg_score: number
        student_count: number
      }>)
    : []

  return rows.map((row) => ({
    topicId: row.topic_id,
    topicName: row.topic_name,
    subjectName: row.subject_name,
    subjectShort: row.subject_short,
    avgScore: row.avg_score,
    studentCount: row.student_count,
  }))
}

export async function getRecentSessions(range: TimeRange): Promise<RecentSession[]> {
  const { organizationId } = await requireAdmin()

  let query = adminClient
    .from('quiz_sessions')
    .select('id, mode, score_percentage, ended_at, users(full_name), easa_subjects(name)')
    .eq('organization_id', organizationId)
    .not('ended_at', 'is', null)
    .is('deleted_at', null)
    .order('ended_at', { ascending: false })
    .limit(10)

  const cutoff = rangeToCutoff(range)
  if (cutoff) {
    query = query.gte('ended_at', cutoff)
  }

  const { data, error } = await query
  if (error) {
    console.error('[getRecentSessions] Query error:', error.message)
    throw new Error('Failed to fetch recent sessions')
  }

  const sessionRows = Array.isArray(data)
    ? (data as Array<{
        id: string
        mode: string
        score_percentage: number | null
        ended_at: string
        users: { full_name: string | null } | null
        easa_subjects: { name: string } | null
      }>)
    : []

  return sessionRows.map((row) => ({
    sessionId: row.id,
    studentName: row.users?.full_name ?? null,
    subjectName: row.easa_subjects?.name ?? null,
    mode: row.mode,
    scorePercentage: row.score_percentage,
    endedAt: row.ended_at,
  }))
}
