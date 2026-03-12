import { rpc } from '@/lib/supabase-rpc'
import { createServerSupabaseClient } from '@repo/db/server'

function boundParam(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.trunc(value)))
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
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const safeDays = boundParam(days, 1, 365)
  const { data, error } = await rpc<DailyActivityRow[]>(supabase, 'get_daily_activity', {
    p_student_id: user.id,
    p_days: safeDays,
  })

  if (error) throw new Error(`Failed to fetch daily activity: ${error.message}`)

  return (data ?? []).map((row) => ({
    day: row.day,
    total: Number(row.total),
    correct: Number(row.correct),
    incorrect: Number(row.incorrect),
  }))
}

export async function getSubjectScores(limit = 5): Promise<SubjectScore[]> {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const safeLimit = boundParam(limit, 1, 100)
  const { data, error } = await rpc<SubjectScoreRow[]>(supabase, 'get_subject_scores', {
    p_student_id: user.id,
    p_limit: safeLimit,
  })

  if (error) throw new Error(`Failed to fetch subject scores: ${error.message}`)

  return (data ?? []).map((row) => ({
    subjectId: row.subject_id,
    subjectName: row.subject_name,
    subjectShort: row.subject_short,
    avgScore: Number(row.avg_score),
    sessionCount: Number(row.session_count),
  }))
}
