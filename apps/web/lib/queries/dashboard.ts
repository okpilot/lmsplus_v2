import { createServerSupabaseClient } from '@repo/db/server'
import { cache } from 'react'
import { rpc } from '@/lib/supabase-rpc'
import {
  applyLastPracticed,
  computeExamReadiness,
  getQuestionsToday,
  getStreakData,
} from './dashboard-stats'

export type DashboardData = {
  totalQuestions: number
  answeredCount: number
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
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError) throw new Error(`Auth error: ${authError.message}`)
  if (!user) throw new Error('Not authenticated')

  const [subjectResult, responses, questionsToday, streakData] = await Promise.all([
    getSubjectProgressWithMap(supabase),
    getTotalAnswered(supabase, user.id),
    getQuestionsToday(supabase, user.id),
    getStreakData(supabase, user.id),
  ])

  const { subjects, questionSubjectMap } = subjectResult
  const subjectsWithDates = await applyLastPracticed(
    supabase,
    user.id,
    subjects,
    questionSubjectMap,
  )
  const examReadiness = computeExamReadiness(subjectsWithDates)

  return {
    totalQuestions: subjectsWithDates.reduce((sum, s) => sum + s.totalQuestions, 0),
    answeredCount: responses,
    subjects: subjectsWithDates,
    questionsToday,
    currentStreak: streakData.currentStreak,
    bestStreak: streakData.bestStreak,
    examReadiness,
  }
})

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

type SubjectRow = { id: string; code: string; name: string; short: string; sort_order: number }
type QuestionIdSubjectRow = { id: string; subject_id: string }
type MasteryRow = {
  subject_id: string
  topic_id: string | null
  total: number | string
  correct: number | string
}

type SubjectProgressResult = {
  subjects: SubjectProgress[]
  questionSubjectMap: Map<string, string>
}

async function getSubjectProgressWithMap(supabase: SupabaseClient): Promise<SubjectProgressResult> {
  const { data: subjectsData, error: subjectsError } = await supabase
    .from('easa_subjects')
    .select('id, code, name, short, sort_order')
    .order('sort_order')
  if (subjectsError) throw new Error(`Failed to fetch subjects: ${subjectsError.message}`)

  const subjects = (subjectsData ?? []) as SubjectRow[]
  if (!subjects.length) return { subjects: [], questionSubjectMap: new Map() }

  // Per-subject mastery counts aggregated in Postgres (#540): the prior client-side
  // numerator/denominator reads truncated at the PostgREST 1000-row cap. The RPC returns
  // both subject-level (topic_id === null) and topic-level rows; we use the subject rows.
  const { data: masteryData, error: masteryError } = await rpc<MasteryRow[]>(
    supabase,
    'get_student_mastery_stats',
    {},
  )
  if (masteryError) throw new Error(`Failed to fetch mastery stats: ${masteryError.message}`)

  const masteryBySubject = new Map<string, { total: number; correct: number }>()
  for (const row of masteryData ?? []) {
    if (row.topic_id !== null) continue
    if (!row.subject_id) continue
    masteryBySubject.set(row.subject_id, {
      total: Number(row.total),
      correct: Number(row.correct),
    })
  }

  // Last-practiced attribution only (deferred #668 — this read is still truncated at the
  // 1000-row cap). NOT used for mastery. Any-status non-deleted reproduces the legacy map
  // (active ∪ non-deleted-answered) exactly, so lastPracticedAt does not regress.
  const { data: questionMapData, error: questionMapError } = await supabase
    .from('questions')
    .select('id, subject_id')
    .is('deleted_at', null)
  if (questionMapError) {
    throw new Error(`Failed to fetch question-subject map: ${questionMapError.message}`)
  }

  const questionSubjectMap = new Map<string, string>()
  for (const q of (questionMapData ?? []) as QuestionIdSubjectRow[]) {
    questionSubjectMap.set(q.id, q.subject_id)
  }

  const result = subjects
    .map((s) => {
      const counts = masteryBySubject.get(s.id) ?? { total: 0, correct: 0 }
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
    })
    .filter((s) => s.totalQuestions > 0 || s.answeredCorrectly > 0)

  return { subjects: result, questionSubjectMap }
}

async function getTotalAnswered(supabase: SupabaseClient, userId: string): Promise<number> {
  const { count } = await supabase
    .from('student_responses')
    .select('*', { count: 'exact', head: true })
    .eq('student_id', userId)
  return count ?? 0
}
