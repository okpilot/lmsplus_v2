import { adminClient } from '@repo/db/admin'
import { requireAdmin } from '@/lib/auth/require-admin'
import { rangeToCutoff, rangeToDays } from './_lib/range-cutoff'
import type {
  DashboardFilters,
  DashboardKpis,
  DashboardStudent,
  RecentSession,
  TimeRange,
  WeakTopic,
} from './types'
import { STUDENTS_PAGE_SIZE } from './types'

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
  const ws = json.weakestSubject
  const weakestSubject =
    ws !== null && typeof ws === 'object' && 'name' in ws && 'short' in ws && 'avgMastery' in ws
      ? (ws as { name: string; short: string; avgMastery: number })
      : null
  return {
    activeStudents: Number(json.activeStudents) || 0,
    totalStudents: Number(json.totalStudents) || 0,
    avgMastery: Number(json.avgMastery) || 0,
    sessionsThisPeriod: Number(json.sessionsThisPeriod) || 0,
    weakestSubject,
    examReadyStudents: Number(json.examReadyStudents) || 0,
  }
}

// Single SECURITY DEFINER RPC (get_admin_dashboard_students) does the join + filter +
// sort + paginate + count entirely in Postgres, so no client read is capped at
// PostgREST's max_rows=1000 (#682/#668). Org is derived from auth.uid() in the RPC.
export async function getDashboardStudents(
  filters: DashboardFilters,
): Promise<{ students: DashboardStudent[]; totalCount: number }> {
  const { supabase } = await requireAdmin()

  const { data, error } = await authRpc(supabase)('get_admin_dashboard_students', {
    p_status: filters.status ?? null,
    p_sort: filters.sort,
    p_dir: filters.dir,
    p_limit: STUDENTS_PAGE_SIZE,
    p_offset: (filters.page - 1) * STUDENTS_PAGE_SIZE,
  })
  if (error) {
    console.error('[getDashboardStudents] RPC error:', error.message)
    throw new Error('Failed to fetch students')
  }

  type Row = {
    id: string
    full_name: string | null
    email: string
    last_active_at: string | null
    deleted_at: string | null
    session_count: number
    avg_score: number | null
    mastery: number
    total_count: number
  }
  const rows = Array.isArray(data) ? (data as Row[]) : []

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const students: DashboardStudent[] = rows.map((r) => ({
    id: r.id,
    fullName: r.full_name,
    email: r.email,
    lastActiveAt: r.last_active_at,
    sessionCount: r.session_count ?? 0,
    avgScore: r.avg_score ?? null,
    mastery: r.mastery ?? 0,
    isActive: r.deleted_at === null,
    hasRecentActivity: r.last_active_at
      ? new Date(r.last_active_at).getTime() > sevenDaysAgo
      : false,
  }))

  // total_count is the count(*) OVER() window value — identical on every row, and absent
  // (→ 0) on an out-of-range page that returns no rows.
  const totalCount = Number(rows[0]?.total_count ?? 0)

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
