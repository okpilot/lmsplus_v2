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
  started_at: string
  ended_at: string
  subject_id: string | null
  subject_name: string | null
  // BIGINT / NUMERIC columns: PostgREST serializes them as strings — coerce with Number() before use.
  score_percentage: number | string | null
  answered_count: number | string
  total_count: number | string
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

  if (allRows.length === 0) {
    // The RPC returned no rows for this offset — gate the probe on allRows (pre-filter), the
    // true "is this page out of range?" signal. page <= 1 → genuinely empty list; page > 1 →
    // out-of-range, so probe for the real total to redirect to the actual last page, not page 1.
    if (page <= 1) return { ok: true, sessions: [], totalCount: 0 }
    return probeOutOfRangeTotal(supabase, sortColumn, dir)
  }

  // Internal exam attempts live in the dedicated student "My Reports" tab and the admin
  // attempts table — they must NOT pollute the practice/quiz session reports list. The live
  // RPC already excludes them server-side; this filter is belt-and-suspenders against drift.
  const rows = allRows.filter((r) => r.mode !== 'internal_exam')

  // Every returned row was filtered out → the visible list is empty, so report 0 to match.
  // No probe here: allRows was non-empty, so this is a filtered page, not an out-of-range one.
  if (rows.length === 0) return { ok: true, sessions: [], totalCount: 0 }

  // total_count comes from the window function — same on every row. It is a BIGINT, which
  // PostgREST serializes as a string, so coerce with Number() before the caller divides by it.
  const totalCount = Number(rows[0]?.total_count ?? 0)

  return { ok: true, sessions: rows.map(mapRpcRow), totalCount }
}

/**
 * Recover the true total via a probe at offset 0, used when an out-of-range page (page > 1)
 * returns no rows. `total_count` is a BIGINT (string over the wire) — coerced with Number().
 */
async function probeOutOfRangeTotal(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  sortColumn: string,
  dir: SortDir,
): Promise<SessionReportsResult> {
  const { data, error } = (await supabase.rpc('get_session_reports', {
    p_sort: sortColumn,
    p_dir: dir,
    p_limit: 1,
    p_offset: 0,
  })) as { data: unknown; error: { message: string } | null }
  if (error) {
    console.error('[getSessionReports] Probe RPC error:', error.message)
    return { ok: false, error: 'Failed to load reports' }
  }
  const probeRows = Array.isArray(data) ? (data as RpcRow[]) : []
  return { ok: true, sessions: [], totalCount: Number(probeRows[0]?.total_count ?? 0) }
}

function mapRpcRow(r: RpcRow): SessionReport {
  const start = new Date(r.started_at).getTime()
  const end = new Date(r.ended_at).getTime()
  return {
    id: r.id,
    mode: r.mode,
    subjectName: r.subject_name ?? null,
    totalQuestions: r.total_questions,
    // answered_count is a BIGINT (string over the PostgREST wire) — coerce to a number.
    answeredCount: Number(r.answered_count),
    correctCount: r.correct_count,
    scorePercentage: r.score_percentage === null ? null : Number(r.score_percentage),
    startedAt: r.started_at,
    endedAt: r.ended_at,
    durationMinutes: Math.max(0, Math.round((end - start) / 60000)),
  }
}
