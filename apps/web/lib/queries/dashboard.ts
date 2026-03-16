import { createServerSupabaseClient } from '@repo/db/server'

export type DashboardData = {
  totalQuestions: number
  answeredCount: number
  subjects: SubjectProgress[]
  recentSessions: RecentSession[]
}

export type SubjectProgress = {
  id: string
  code: string
  name: string
  short: string
  totalQuestions: number
  answeredCorrectly: number
  masteryPercentage: number
}

export type RecentSession = {
  id: string
  mode: string
  subjectName: string | null
  totalQuestions: number
  correctCount: number
  scorePercentage: number | null
  startedAt: string
}

export async function getDashboardData(): Promise<DashboardData> {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError) throw new Error(`Auth error: ${authError.message}`)
  if (!user) throw new Error('Not authenticated')

  const [subjects, responses, recentSessions] = await Promise.all([
    getSubjectProgress(supabase, user.id),
    getTotalAnswered(supabase, user.id),
    getRecentSessions(supabase, user.id),
  ])

  return {
    totalQuestions: subjects.reduce((sum, s) => sum + s.totalQuestions, 0),
    answeredCount: responses,
    subjects,
    recentSessions,
  }
}

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

type SubjectRow = { id: string; code: string; name: string; short: string; sort_order: number }
type QuestionSubjectRow = { subject_id: string }
type QuestionIdSubjectRow = { id: string; subject_id: string }
type ResponseRow = { question_id: string }

async function getSubjectProgress(
  supabase: SupabaseClient,
  userId: string,
): Promise<SubjectProgress[]> {
  const { data: subjectsData } = await supabase
    .from('easa_subjects')
    .select('id, code, name, short, sort_order')
    .order('sort_order')

  const subjects = (subjectsData ?? []) as SubjectRow[]
  if (!subjects.length) return []

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

  const correctPerSubject = new Map<string, Set<string>>()
  for (const q of correctQuestions) {
    let set = correctPerSubject.get(q.subject_id)
    if (!set) {
      set = new Set()
      correctPerSubject.set(q.subject_id, set)
    }
    set.add(q.id)
  }

  return subjects
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
      }
    })
    .filter((s) => s.totalQuestions > 0)
}

async function getTotalAnswered(supabase: SupabaseClient, userId: string): Promise<number> {
  const { count } = await supabase
    .from('student_responses')
    .select('*', { count: 'exact', head: true })
    .eq('student_id', userId)
  return count ?? 0
}

type SessionRow = {
  id: string
  mode: string
  total_questions: number
  correct_count: number
  score_percentage: number | null
  started_at: string
  subject_id: string | null
}

type SubjectNameRow = { id: string; name: string }

async function getRecentSessions(
  supabase: SupabaseClient,
  userId: string,
): Promise<RecentSession[]> {
  const { data: sessionsData } = await supabase
    .from('quiz_sessions')
    .select('id, mode, total_questions, correct_count, score_percentage, started_at, subject_id')
    .eq('student_id', userId)
    .not('ended_at', 'is', null)
    .is('deleted_at', null)
    .order('started_at', { ascending: false })
    .limit(5)

  const sessions = (sessionsData ?? []) as SessionRow[]
  if (!sessions.length) return []

  const subjectIds = [...new Set(sessions.map((s) => s.subject_id).filter(Boolean))] as string[]
  const { data: subjectsData } =
    subjectIds.length > 0
      ? await supabase.from('easa_subjects').select('id, name').in('id', subjectIds)
      : { data: [] }

  const subjects = (subjectsData ?? []) as SubjectNameRow[]
  const subjectMap = new Map(subjects.map((s) => [s.id, s.name]))

  return sessions.map((s) => ({
    id: s.id,
    mode: s.mode,
    subjectName: s.subject_id ? (subjectMap.get(s.subject_id) ?? null) : null,
    totalQuestions: s.total_questions,
    correctCount: s.correct_count,
    scorePercentage: s.score_percentage,
    startedAt: s.started_at,
  }))
}
