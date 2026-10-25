import { createServerSupabaseClient } from '@repo/db/server'
import { getSessionUser } from '@/lib/auth/get-session-user'

function boundParam(value: number, min: number, max: number): number {
  const n = Number.isFinite(value) ? value : min
  return Math.max(min, Math.min(max, Math.trunc(n)))
}

export type DailyActivity = {
  day: string
  total: number
  correct: number
  incorrect: number
}

export type SubjectScore = {
  subjectId: string
  subjectName: string
  subjectShort: string
  avgScore: number
  sessionCount: number
}

type DailyActivityRow = { day: string; total: number; correct: number; incorrect: number }
type SubjectScoreRow = {
  subject_id: string
  subject_name: string
  subject_short: string
  avg_score: number
  session_count: number
}

export async function getDailyActivity(days = 30): Promise<DailyActivity[]> {
  const supabase = await createServerSupabaseClient()
  const user = await getSessionUser()
  if (!user) throw new Error('Not authenticated')

  const safeDays = boundParam(days, 1, 365)
  const { data, error } = await supabase.rpc('get_daily_activity', {
    p_student_id: user.id,
    p_days: safeDays,
  })

  if (error) throw new Error(`Failed to fetch daily activity: ${error.message}`)

  // Wire shape is not validated by the client — guard the array per code-style §5.
  return (Array.isArray(data) ? data : []).map((row: DailyActivityRow) => ({
    day: row.day,
    total: Number(row.total),
    correct: Number(row.correct),
    incorrect: Number(row.incorrect),
  }))
}

export async function getSubjectScores(limit = 5): Promise<SubjectScore[]> {
  const supabase = await createServerSupabaseClient()
  const user = await getSessionUser()
  if (!user) throw new Error('Not authenticated')

  const safeLimit = boundParam(limit, 1, 100)
  const { data, error } = await supabase.rpc('get_subject_scores', {
    p_student_id: user.id,
    p_limit: safeLimit,
  })

  if (error) throw new Error(`Failed to fetch subject scores: ${error.message}`)

  // Wire shape is not validated by the client — guard the array per code-style §5.
  return (Array.isArray(data) ? data : []).map((row: SubjectScoreRow) => ({
    subjectId: row.subject_id,
    subjectName: row.subject_name,
    subjectShort: row.subject_short,
    avgScore: Number(row.avg_score),
    sessionCount: Number(row.session_count),
  }))
}
