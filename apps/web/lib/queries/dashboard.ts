import { createServerSupabaseClient } from '@repo/db/server'
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

export async function getDashboardData(): Promise<DashboardData> {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError) throw new Error(`Auth error: ${authError.message}`)
  if (!user) throw new Error('Not authenticated')

  const [subjectResult, responses, questionsToday, streakData] = await Promise.all([
    getSubjectProgressWithMap(supabase, user.id),
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
}

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

type SubjectRow = { id: string; code: string; name: string; short: string; sort_order: number }
type QuestionSubjectRow = { subject_id: string }
type QuestionIdSubjectRow = { id: string; subject_id: string }
type ResponseRow = { question_id: string }

type SubjectProgressResult = {
  subjects: SubjectProgress[]
  questionSubjectMap: Map<string, string>
}

async function getSubjectProgressWithMap(
  supabase: SupabaseClient,
  userId: string,
): Promise<SubjectProgressResult> {
  const { data: subjectsData } = await supabase
    .from('easa_subjects')
    .select('id, code, name, short, sort_order')
    .order('sort_order')

  const subjects = (subjectsData ?? []) as SubjectRow[]
  if (!subjects.length) return { subjects: [], questionSubjectMap: new Map() }

  const { data: questionCountsData } = await supabase
    .from('questions')
    .select('subject_id')
    .eq('status', 'active')

  const questionCounts = (questionCountsData ?? []) as QuestionSubjectRow[]

  const { data: correctResponsesData } = await supabase
    .from('student_responses')
    .select('question_id')
    .eq('student_id', userId)
    .eq('is_correct', true)

  const correctResponses = (correctResponsesData ?? []) as ResponseRow[]

  const qCountMap = new Map<string, number>()
  for (const q of questionCounts) {
    qCountMap.set(q.subject_id, (qCountMap.get(q.subject_id) ?? 0) + 1)
  }

  const correctQuestionIds = new Set(correctResponses.map((r) => r.question_id))

  const { data: correctQuestionsData } =
    correctQuestionIds.size > 0
      ? await supabase
          .from('questions')
          .select('id, subject_id')
          .in('id', [...correctQuestionIds])
      : { data: [] }

  const correctQuestions = (correctQuestionsData ?? []) as QuestionIdSubjectRow[]

  const questionSubjectMap = new Map<string, string>()
  const correctPerSubject = new Map<string, Set<string>>()
  for (const q of correctQuestions) {
    questionSubjectMap.set(q.id, q.subject_id)
    let set = correctPerSubject.get(q.subject_id)
    if (!set) {
      set = new Set()
      correctPerSubject.set(q.subject_id, set)
    }
    set.add(q.id)
  }

  const result = subjects
    .map((s) => {
      const total = qCountMap.get(s.id) ?? 0
      const correct = correctPerSubject.get(s.id)?.size ?? 0
      return {
        id: s.id,
        code: s.code,
        name: s.name,
        short: s.short,
        totalQuestions: total,
        answeredCorrectly: correct,
        masteryPercentage: total > 0 ? Math.round((correct / total) * 100) : 0,
        lastPracticedAt: null as string | null,
      }
    })
    .filter((s) => s.totalQuestions > 0)

  return { subjects: result, questionSubjectMap }
}

async function getTotalAnswered(supabase: SupabaseClient, userId: string): Promise<number> {
  const { count } = await supabase
    .from('student_responses')
    .select('*', { count: 'exact', head: true })
    .eq('student_id', userId)
  return count ?? 0
}
