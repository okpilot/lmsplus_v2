import { createServerSupabaseClient } from '@repo/db/server'
import type { QuizReportQuestionsResult } from './quiz-report'
import { PAGE_SIZE } from './quiz-report'
import { type AnswerRow, buildReportQuestions, type QuestionRow } from './report-question-builder'

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
    .order('id')
    .range(from, to)

  if (answersError) {
    console.error('[getQuizReportQuestions] Answers query error:', answersError.message)
    return { ok: false, error: 'Failed to load questions' }
  }

  const answers = Array.isArray(answersData) ? (answersData as AnswerRow[]) : []

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

  const questions = Array.isArray(questionsData) ? (questionsData as QuestionRow[]) : []
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
  const correctRows = Array.isArray(correctData)
    ? (correctData as { question_id: string; correct_option_id: string }[])
    : []
  const correctMap = new Map<string, string>()
  for (const row of correctRows) {
    correctMap.set(row.question_id, row.correct_option_id)
  }

  const reportQuestions = buildReportQuestions(answers, questionMap, correctMap)

  return { ok: true, questions: reportQuestions, totalCount: total }
}
