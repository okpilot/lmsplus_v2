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

  // RPC not yet in generated types — remove cast after running `supabase gen types`
  // @ts-expect-error -- get_session_reports not in generated types until migration is applied
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

  const rows = Array.isArray(data) ? (data as RpcRow[]) : []

  if (rows.length === 0) {
    // Could be empty result or out-of-range page — for out-of-range we need to know totalCount.
    // If page > 1 and no rows, total_count is unknown. Return 0 and let caller handle redirect.
    return { ok: true, sessions: [], totalCount: 0 }
  }

  // total_count comes from the window function — same on every row
  const totalCount = rows[0]?.total_count ?? 0

  const sessions: SessionReport[] = rows.map((r) => {
    const start = new Date(r.started_at).getTime()
    const end = new Date(r.ended_at).getTime()
    const durationMinutes = Math.max(0, Math.round((end - start) / 60000))

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
      durationMinutes,
    }
  })

  return { ok: true, sessions, totalCount }
}
