import { createServerSupabaseClient } from '@repo/db/server'

export type SessionReport = {
  id: string
  mode: string
  subjectName: string | null
  totalQuestions: number
  answeredCount: number
  correctCount: number
  scorePercentage: number | null
  startedAt: string
  endedAt: string
  durationMinutes: number
}

export type SortKey = 'date' | 'score' | 'subject'
export type SortDir = 'asc' | 'desc'

type SessionReportsOpts = {
  page: number
  sort: SortKey
  dir: SortDir
}

type SessionReportsResult =
  | { ok: true; sessions: SessionReport[]; totalCount: number }
  | { ok: false; error: string }

type RpcRow = {
  id: string
  mode: string
  total_questions: number
  correct_count: number
  score_percentage: number | null
  started_at: string
  ended_at: string
  subject_id: string | null
  subject_name: string | null
  answered_count: number
  total_count: number
}

export const PAGE_SIZE = 10

const SORT_COLUMN_MAP: Record<SortKey, string> = {
  date: 'started_at',
  score: 'score_percentage',
  subject: 'subject_name',
}

/**
 * Fetch paginated session reports for the current user via `get_session_reports` RPC.
 *
 * When the requested page is out of range (page > 1 and no rows returned), a probe
 * call is issued at offset 0 to recover the true `total_count` so that callers can
 * redirect to the real last page instead of falling back to page 1.
 */
export async function getSessionReports(opts: SessionReportsOpts): Promise<SessionReportsResult> {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError) {
    console.error('[getSessionReports] Auth error:', authError.message)
    return { ok: false, error: 'Authentication failed' }
  }
  if (!user) {
    return { ok: false, error: 'Not authenticated' }
  }

  const { page, sort, dir } = opts
  const sortColumn = SORT_COLUMN_MAP[sort]
  const offset = (page - 1) * PAGE_SIZE

  const { data, error: rpcError } = (await supabase.rpc('get_session_reports', {
    p_sort: sortColumn,
    p_dir: dir,
    p_limit: PAGE_SIZE,
    p_offset: offset,
  })) as { data: unknown; error: { message: string } | null }

  if (rpcError) {
    console.error('[getSessionReports] RPC error:', rpcError.message)
    return { ok: false, error: 'Failed to load reports' }
  }

  const allRows = Array.isArray(data) ? (data as RpcRow[]) : []

  // Internal exam attempts live in the dedicated student "My Reports" tab and the
  // admin attempts table — they must NOT pollute the practice/quiz session reports list.
  const rows = allRows.filter((r) => r.mode !== 'internal_exam')

  if (rows.length === 0) {
    if (page <= 1) {
      // Genuinely empty list — no sessions exist for this user.
      return { ok: true, sessions: [], totalCount: 0 }
    }
    // Out-of-range page: the paged fetch returned nothing but sessions may exist on earlier
    // pages. Issue a probe at offset 0 to recover the real total_count so the caller can
    // redirect to the true last page instead of page 1.
    const { data: probeData, error: probeError } = (await supabase.rpc('get_session_reports', {
      p_sort: sortColumn,
      p_dir: dir,
      p_limit: 1,
      p_offset: 0,
    })) as { data: unknown; error: { message: string } | null }
    if (probeError) {
      console.error('[getSessionReports] Probe RPC error:', probeError.message)
      return { ok: false, error: 'Failed to load reports' }
    }
    const probeRows = Array.isArray(probeData) ? (probeData as RpcRow[]) : []
    const probedTotal = probeRows[0]?.total_count ?? 0
    return { ok: true, sessions: [], totalCount: probedTotal }
  }

  // total_count comes from the window function — same on every row
  const totalCount = rows[0]?.total_count ?? 0

  return { ok: true, sessions: rows.map(mapRpcRow), totalCount }
}

function mapRpcRow(r: RpcRow): SessionReport {
  const start = new Date(r.started_at).getTime()
  const end = new Date(r.ended_at).getTime()
  return {
    id: r.id,
    mode: r.mode,
    subjectName: r.subject_name ?? null,
    totalQuestions: r.total_questions,
    answeredCount: r.answered_count,
    correctCount: r.correct_count,
    scorePercentage: r.score_percentage,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    durationMinutes: Math.max(0, Math.round((end - start) / 60000)),
  }
}
