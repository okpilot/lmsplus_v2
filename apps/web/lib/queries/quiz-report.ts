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
  mode: string
  subjectName: string | null
  totalQuestions: number
  answeredCount: number
  correctCount: number
  scorePercentage: number
  startedAt: string
  endedAt: string | null
  questions: QuizReportQuestion[]
}

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
  options: { id: string; text: string }[]
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

  const { data: sessionData } = await supabase
    .from('quiz_sessions')
    .select(
      'id, mode, subject_id, started_at, ended_at, total_questions, correct_count, score_percentage',
    )
    .eq('id', sessionId)
    .eq('student_id', user.id)
    .is('deleted_at', null)
    .maybeSingle()

  const session = sessionData as SessionRow | null
  if (!session) return null
  // Only serve reports for completed sessions — prevents mid-session answer exposure
  if (!session.ended_at) return null

  // Resolve subject name if available
  let subjectName: string | null = null
  if (session.subject_id) {
    const { data: subjectData } = await supabase
      .from('easa_subjects')
      .select('name')
      .eq('id', session.subject_id)
      .maybeSingle()
    subjectName = (subjectData as { name: string } | null)?.name ?? null
  }

  const { data: answersData } = await supabase
    .from('quiz_session_answers')
    .select('question_id, selected_option_id, is_correct, response_time_ms')
    .eq('session_id', sessionId)

  const answers = (answersData ?? []) as AnswerRow[]
  if (!answers.length) return null

  const questionIds = answers.map((a) => a.question_id)

  const { data: questionsData } = await supabase
    .from('questions')
    .select('id, question_text, question_number, options, explanation_text')
    .in('id', questionIds)

  const questions = (questionsData ?? []) as QuestionRow[]
  const questionMap = new Map<string, QuestionRow>()
  for (const q of questions) {
    questionMap.set(q.id, q)
  }

  const { data: correctData, error: rpcError } = await supabase.rpc('get_report_correct_options', {
    p_session_id: sessionId,
  })
  if (rpcError) {
    console.error('[getQuizReport] RPC error:', rpcError.message)
    return null
  }
  const correctMap = new Map<string, string>()
  for (const row of correctData ?? []) {
    correctMap.set(row.question_id, row.correct_option_id)
  }

  const reportQuestions = buildReportQuestions(answers, questionMap, correctMap)

  return {
    sessionId: session.id,
    mode: session.mode,
    subjectName,
    totalQuestions: session.total_questions,
    answeredCount: answers.length,
    correctCount: session.correct_count,
    scorePercentage: session.score_percentage ?? 0,
    startedAt: session.started_at,
    endedAt: session.ended_at,
    questions: reportQuestions,
  }
}

function buildReportQuestions(
  answers: AnswerRow[],
  questionMap: Map<string, QuestionRow>,
  correctMap: Map<string, string>,
): QuizReportQuestion[] {
  return answers.map((answer) => {
    const question = questionMap.get(answer.question_id)
    const options = question?.options ?? []

    return {
      questionId: answer.question_id,
      questionText: question?.question_text ?? '',
      questionNumber: question?.question_number ?? null,
      isCorrect: answer.is_correct,
      selectedOptionId: answer.selected_option_id,
      correctOptionId: correctMap.get(answer.question_id) ?? '',
      options: options.map((o) => ({ id: o.id, text: o.text })),
      explanationText: question?.explanation_text ?? null,
      responseTimeMs: answer.response_time_ms,
    }
  })
}
