import { createServerSupabaseClient } from '@repo/db/server'
import { cache } from 'react'
import { getSessionUser } from '@/lib/auth/get-session-user'
import {
  computeExamReadiness,
  fetchLastPracticed,
  getQuestionsToday,
  getStreakData,
  mergeLastPracticed,
} from './dashboard-stats'

export type DashboardData = {
  totalQuestions: number
  subjects: SubjectProgress[]
  questionsToday: number
  currentStreak: number
  bestStreak: number
  examReadiness: { readyCount: number; totalCount: number; projectedDate: string | null }
}

export type SubjectProgress = {
  id: string
  code: string
  name: string
  short: string
  totalQuestions: number
  answeredCorrectly: number
  masteryPercentage: number
  lastPracticedAt: string | null
}

export const getDashboardData = cache(async (): Promise<DashboardData> => {
  const supabase = await createServerSupabaseClient()
  const user = await getSessionUser()
  if (!user) throw new Error('Not authenticated')

  const [subjects, questionsToday, streakData, lastPracticed] = await Promise.all([
    getSubjectProgress(supabase),
    getQuestionsToday(supabase, user.id),
    getStreakData(supabase),
    fetchLastPracticed(supabase),
  ])

  const subjectsWithDates = mergeLastPracticed(subjects, lastPracticed)
  const examReadiness = computeExamReadiness(subjectsWithDates)

  return {
    totalQuestions: subjectsWithDates.reduce((sum, s) => sum + s.totalQuestions, 0),
    subjects: subjectsWithDates,
    questionsToday,
    currentStreak: streakData.currentStreak,
    bestStreak: streakData.bestStreak,
    examReadiness,
  }
})

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

type SubjectRow = { id: string; code: string; name: string; short: string; sort_order: number }
type MasteryRow = {
  subject_id: string
  topic_id: string | null
  total: number | string
  correct: number | string
}

// Wire shape is not validated by the client — guard the array per code-style §5.
function buildMasteryBySubject(
  masteryData: unknown,
): Map<string, { total: number; correct: number }> {
  const map = new Map<string, { total: number; correct: number }>()
  for (const row of Array.isArray(masteryData) ? (masteryData as MasteryRow[]) : []) {
    if (row.topic_id !== null) continue
    if (!row.subject_id) continue
    const total = Number(row.total)
    const correct = Number(row.correct)
    // Skip malformed rows rather than store NaN, which would poison the mastery percentage.
    if (!Number.isFinite(total) || !Number.isFinite(correct)) continue
    map.set(row.subject_id, { total, correct })
  }
  return map
}

function toSubjectProgress(
  s: SubjectRow,
  counts: { total: number; correct: number },
): SubjectProgress {
  const { total, correct } = counts
  return {
    id: s.id,
    code: s.code,
    name: s.name,
    short: s.short,
    totalQuestions: total,
    answeredCorrectly: correct,
    // correct counts correct responses to non-deleted questions of any status,
    // so it can exceed total (active-only) when the student answered a now-draft
    // question (#540/#664). Clamp the displayed percentage to 100.
    masteryPercentage: total > 0 ? Math.min(Math.round((correct / total) * 100), 100) : 0,
    lastPracticedAt: null as string | null,
  }
}

async function getSubjectProgress(supabase: SupabaseClient): Promise<SubjectProgress[]> {
  // Per-subject mastery counts aggregated in Postgres (#540): the prior client-side
  // numerator/denominator reads truncated at the PostgREST 1000-row cap. The RPC returns
  // both subject-level (topic_id === null) and topic-level rows; we use the subject rows.
  const [subjectsResult, masteryResult] = await Promise.all([
    supabase.from('easa_subjects').select('id, code, name, short, sort_order').order('sort_order'),
    supabase.rpc('get_student_mastery_stats'),
  ])
  const { data: subjectsData, error: subjectsError } = subjectsResult
  if (subjectsError) throw new Error(`Failed to fetch subjects: ${subjectsError.message}`)

  const { data: masteryData, error: masteryError } = masteryResult
  if (masteryError) {
    throw new Error(`Failed to fetch mastery stats: ${masteryError.message}`)
  }

  const subjects = (subjectsData ?? []) as SubjectRow[]
  const masteryBySubject = buildMasteryBySubject(masteryData)

  return subjects
    .map((s) => toSubjectProgress(s, masteryBySubject.get(s.id) ?? { total: 0, correct: 0 }))
    .filter((s) => s.totalQuestions > 0 || s.answeredCorrectly > 0)
}
