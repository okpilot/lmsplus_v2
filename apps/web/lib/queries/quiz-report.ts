import { createServerSupabaseClient } from '@repo/db/server'

export type QuizReportQuestion = {
  questionId: string
  questionText: string
  questionNumber: string | null
  isCorrect: boolean
  selectedOptionId: string
  correctOptionId: string
  options: { id: string; text: string }[]
  explanationText: string | null
  explanationImageUrl: string | null
  responseTimeMs: number
}

export type QuizReportSummary = {
  sessionId: string
  mode: string
  subjectName: string | null
  totalQuestions: number
  answeredCount: number
  correctCount: number
  scorePercentage: number
  startedAt: string
  endedAt: string | null
}

export type QuizReportQuestionsResult =
  | { ok: true; questions: QuizReportQuestion[]; totalCount: number }
  | { ok: false; error: string }

export const PAGE_SIZE = 10

type SessionRow = {
  id: string
  mode: string
  subject_id: string | null
  started_at: string
  ended_at: string | null
  total_questions: number
  correct_count: number
  score_percentage: number | null
}

export async function getQuizReportSummary(sessionId: string): Promise<QuizReportSummary | null> {
  const supabase = await createServerSupabaseClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError) {
    console.error('[getQuizReportSummary] Auth error:', authError.message)
    return null
  }
  if (!user) return null

  const { data: sessionData, error: sessionError } = await supabase
    .from('quiz_sessions')
    .select(
      'id, mode, subject_id, started_at, ended_at, total_questions, correct_count, score_percentage',
    )
    .eq('id', sessionId)
    .eq('student_id', user.id)
    .is('deleted_at', null)
    .maybeSingle()

  if (sessionError) {
    console.error('[getQuizReportSummary] Session query error:', sessionError.message)
    return null
  }
  const session = sessionData as SessionRow | null
  if (!session) return null
  // Only serve reports for completed sessions — prevents mid-session answer exposure
  if (!session.ended_at) return null

  // Fetch total answered count from quiz_session_answers
  const { count: answeredCount, error: countError } = await supabase
    .from('quiz_session_answers')
    .select('question_id', { count: 'exact', head: true })
    .eq('session_id', sessionId)
  if (countError) {
    console.error('[getQuizReportSummary] Count query error:', countError.message)
    return null
  }

  // Resolve subject name if available (display-only — don't abort report on failure)
  let subjectName: string | null = null
  if (session.subject_id) {
    const { data: subjectData, error: subjectError } = await supabase
      .from('easa_subjects')
      .select('name')
      .eq('id', session.subject_id)
      .maybeSingle()
    if (subjectError) {
      console.error('[getQuizReportSummary] Subject lookup error:', subjectError.message)
    }
    subjectName = (subjectData as { name: string } | null)?.name ?? null
  }

  return {
    sessionId: session.id,
    mode: session.mode,
    subjectName,
    totalQuestions: session.total_questions,
    answeredCount: answeredCount ?? 0,
    correctCount: session.correct_count,
    scorePercentage: session.score_percentage ?? 0,
    startedAt: session.started_at,
    endedAt: session.ended_at,
  }
}
