import { createServerSupabaseClient } from '@repo/db/server'
import type { QuizReportQuestion, QuizReportQuestionsResult } from './quiz-report'
import { PAGE_SIZE } from './quiz-report'

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
  explanation_image_url: string | null
}

export async function getQuizReportQuestions(opts: {
  sessionId: string
  page: number
}): Promise<QuizReportQuestionsResult> {
  const { sessionId, page } = opts
  if (!sessionId) return { ok: false, error: 'Failed to load questions' }
  const supabase = await createServerSupabaseClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError) {
    console.error('[getQuizReportQuestions] Auth error:', authError.message)
    return { ok: false, error: 'Failed to load questions' }
  }
  if (!user) return { ok: false, error: 'Failed to load questions' }

  // Verify session ownership and completion guard
  const { data: sessionData } = await supabase
    .from('quiz_sessions')
    .select('id, ended_at')
    .eq('id', sessionId)
    .eq('student_id', user.id)
    .is('deleted_at', null)
    .maybeSingle()

  const session = sessionData as { id: string; ended_at: string | null } | null
  if (!session) return { ok: false, error: 'Failed to load questions' }
  // Only serve questions for completed sessions — prevents mid-session answer exposure
  if (!session.ended_at) return { ok: false, error: 'Failed to load questions' }

  // Count first — PostgREST returns 416 (and null count) for out-of-range .range() requests.
  const { count: totalCount, error: countError } = await supabase
    .from('quiz_session_answers')
    .select('question_id', { count: 'exact', head: true })
    .eq('session_id', sessionId)

  if (countError) {
    console.error('[getQuizReportQuestions] Count query error:', countError.message)
    return { ok: false, error: 'Failed to load questions' }
  }

  const total = totalCount ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  if (total === 0 || page > totalPages) {
    return { ok: true, questions: [], totalCount: total }
  }

  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  const { data: answersData, error: answersError } = await supabase
    .from('quiz_session_answers')
    .select('question_id, selected_option_id, is_correct, response_time_ms')
    .eq('session_id', sessionId)
    .order('answered_at', { ascending: true })
    .range(from, to)

  if (answersError) {
    console.error('[getQuizReportQuestions] Answers query error:', answersError.message)
    return { ok: false, error: 'Failed to load questions' }
  }

  const answers = (answersData ?? []) as AnswerRow[]

  if (!answers.length) {
    return { ok: true, questions: [], totalCount: total }
  }

  const questionIds = answers.map((a) => a.question_id)

  // Direct SELECT is safe: ended_at guard above blocks mid-session access,
  // and buildReportQuestions strips options[].correct before returning.
  // Intentionally omits deleted_at — questions answered in a completed session
  // are shown even if subsequently soft-deleted (historical record).
  const { data: questionsData, error: questionsError } = await supabase
    .from('questions')
    .select('id, question_text, question_number, options, explanation_text, explanation_image_url')
    .in('id', questionIds)

  if (questionsError) {
    console.error('[getQuizReportQuestions] Questions query error:', questionsError.message)
    return { ok: false, error: 'Failed to load questions' }
  }

  const questions = (questionsData ?? []) as QuestionRow[]
  const questionMap = new Map<string, QuestionRow>()
  for (const q of questions) {
    questionMap.set(q.id, q)
  }

  const { data: correctData, error: rpcError } = await supabase.rpc('get_report_correct_options', {
    p_session_id: sessionId,
  })
  if (rpcError) {
    console.error('[getQuizReportQuestions] RPC error:', rpcError.message)
    return { ok: false, error: 'Failed to load questions' }
  }
  const correctMap = new Map<string, string>()
  for (const row of correctData ?? []) {
    correctMap.set(row.question_id, row.correct_option_id)
  }

  const reportQuestions = buildReportQuestions(answers, questionMap, correctMap)

  return { ok: true, questions: reportQuestions, totalCount: total }
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
      explanationImageUrl: question?.explanation_image_url ?? null,
      responseTimeMs: answer.response_time_ms,
    }
  })
}
