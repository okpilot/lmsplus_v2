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
  responseTimeMs: number
}

export type QuizReportData = {
  sessionId: string
  totalQuestions: number
  correctCount: number
  scorePercentage: number
  startedAt: string
  endedAt: string | null
  questions: QuizReportQuestion[]
}

type SessionRow = {
  id: string
  started_at: string
  ended_at: string | null
  total_questions: number
  correct_count: number
  score_percentage: number
}

type AnswerRow = {
  question_id: string
  selected_option_id: string
  is_correct: boolean
  response_time_ms: number
}

type QuestionRow = {
  id: string
  question_text: string
  question_number: string | null
  options: { id: string; text: string; correct: boolean }[]
  explanation_text: string | null
}

export async function getQuizReport(sessionId: string): Promise<QuizReportData | null> {
  const supabase = await createServerSupabaseClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError) {
    console.error('[getQuizReport] Auth error:', authError.message)
    return null
  }
  if (!user) return null

  const { data: session } = await supabase
    .from('quiz_sessions')
    .select('id, started_at, ended_at, total_questions, correct_count, score_percentage')
    .eq('id' as string & keyof never, sessionId)
    .returns<SessionRow[]>()
    .maybeSingle()

  if (!session) return null
  // Only serve reports for completed sessions — prevents mid-session answer exposure
  if (!session.ended_at) return null

  const { data: answers } = await supabase
    .from('quiz_session_answers')
    .select('question_id, selected_option_id, is_correct, response_time_ms')
    .eq('session_id' as string & keyof never, sessionId)
    .returns<AnswerRow[]>()

  if (!answers?.length) return null

  const questionIds = answers.map((a) => a.question_id)

  const { data: questions } = await supabase
    .from('questions')
    .select('id, question_text, question_number, options, explanation_text')
    .in('id' as string & keyof never, questionIds)
    .returns<QuestionRow[]>()

  const questionMap = new Map<string, QuestionRow>()
  for (const q of questions ?? []) {
    questionMap.set(q.id, q)
  }

  const reportQuestions = buildReportQuestions(answers, questionMap)

  return {
    sessionId: session.id,
    totalQuestions: session.total_questions,
    correctCount: session.correct_count,
    scorePercentage: session.score_percentage,
    startedAt: session.started_at,
    endedAt: session.ended_at,
    questions: reportQuestions,
  }
}

function buildReportQuestions(
  answers: AnswerRow[],
  questionMap: Map<string, QuestionRow>,
): QuizReportQuestion[] {
  return answers.map((answer) => {
    const question = questionMap.get(answer.question_id)
    const options = question?.options ?? []
    const correctOption = options.find((o) => o.correct)

    return {
      questionId: answer.question_id,
      questionText: question?.question_text ?? '',
      questionNumber: question?.question_number ?? null,
      isCorrect: answer.is_correct,
      selectedOptionId: answer.selected_option_id,
      correctOptionId: correctOption?.id ?? '',
      options: options.map((o) => ({ id: o.id, text: o.text })),
      explanationText: question?.explanation_text ?? null,
      responseTimeMs: answer.response_time_ms,
    }
  })
}
