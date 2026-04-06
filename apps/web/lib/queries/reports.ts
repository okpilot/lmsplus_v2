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

type SessionRow = {
  id: string
  mode: string
  total_questions: number
  correct_count: number
  score_percentage: number | null
  started_at: string
  ended_at: string
  subject_id: string | null
}

type SubjectNameRow = { id: string; name: string }

type AnswerCountRow = { session_id: string }

export const PAGE_SIZE = 10

const SORT_COLUMN_MAP: Record<SortKey, string> = {
  date: 'started_at',
  score: 'score_percentage',
  // subject_id is deterministic (not alphabetical) — PostgREST cannot join-sort in .from() queries
  subject: 'subject_id',
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
  const ascending = dir === 'asc'

  // Count first — PostgREST returns 416 (and null count) for out-of-range .range() requests,
  // so we need the total before applying pagination to handle out-of-range pages gracefully.
  const { count: totalCount, error: countError } = await supabase
    .from('quiz_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', user.id)
    .not('ended_at', 'is', null)
    .is('deleted_at', null)

  if (countError) {
    console.error('[getSessionReports] Count query error:', countError.message)
    return { ok: false, error: 'Failed to load reports' }
  }

  const total = totalCount ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  if (total === 0 || page > totalPages) {
    return { ok: true, sessions: [], totalCount: total }
  }

  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  const { data: sessionsData, error: sessionsError } = await supabase
    .from('quiz_sessions')
    .select(
      'id, mode, total_questions, correct_count, score_percentage, started_at, ended_at, subject_id',
    )
    .eq('student_id', user.id)
    .not('ended_at', 'is', null)
    .is('deleted_at', null)
    .order(sortColumn, { ascending })
    .order('id')
    .range(from, to)

  if (sessionsError) {
    console.error('[getSessionReports] Sessions query error:', sessionsError.message)
    return { ok: false, error: 'Failed to load reports' }
  }

  const sessions = (sessionsData ?? []) as SessionRow[]

  if (!sessions.length) {
    return { ok: true, sessions: [], totalCount: total }
  }

  const sessionIds = sessions.map((s) => s.id)

  const [subjectsResult, answersResult] = await Promise.all([
    (() => {
      const subjectIds = [...new Set(sessions.map((s) => s.subject_id).filter(Boolean))] as string[]
      return subjectIds.length > 0
        ? supabase.from('easa_subjects').select('id, name').in('id', subjectIds)
        : Promise.resolve({ data: [] as SubjectNameRow[], error: null })
    })(),
    // Fetch answer rows to count per-session (can't use total_questions — partial submissions allowed).
    // Transfers up to pageSize * 500 rows of session_id only. Optimize to RPC if this becomes slow.
    supabase.from('quiz_session_answers').select('session_id').in('session_id', sessionIds),
  ])

  if (subjectsResult.error) {
    console.error('[getSessionReports] Subjects query error:', subjectsResult.error.message)
    return { ok: false, error: 'Failed to load reports' }
  }
  if (answersResult.error) {
    console.error('[getSessionReports] Answers query error:', answersResult.error.message)
    return { ok: false, error: 'Failed to load reports' }
  }

  const subjectData = (subjectsResult.data ?? []) as SubjectNameRow[]
  const subjectMap = new Map(subjectData.map((s) => [s.id, s.name]))

  const answerData = (answersResult.data ?? []) as AnswerCountRow[]
  const answeredCountMap = new Map<string, number>()
  for (const row of answerData) {
    answeredCountMap.set(row.session_id, (answeredCountMap.get(row.session_id) ?? 0) + 1)
  }

  const mapped = sessions.map((s) => {
    const start = new Date(s.started_at).getTime()
    const end = new Date(s.ended_at).getTime()
    const durationMinutes = Math.max(0, Math.round((end - start) / 60000))
    const answered = answeredCountMap.get(s.id)
    if (answered === undefined) {
      console.warn('[getSessionReports] No answer rows for completed session:', s.id)
    }

    return {
      id: s.id,
      mode: s.mode,
      subjectName: s.subject_id ? (subjectMap.get(s.subject_id) ?? null) : null,
      totalQuestions: s.total_questions,
      answeredCount: answered ?? s.total_questions,
      correctCount: s.correct_count,
      scorePercentage: s.score_percentage,
      startedAt: s.started_at,
      endedAt: s.ended_at,
      durationMinutes,
    }
  })

  return { ok: true, sessions: mapped, totalCount: total }
}
