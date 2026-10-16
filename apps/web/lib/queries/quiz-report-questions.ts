import { createServerSupabaseClient } from '@repo/db/server'
import { getSessionUser } from '@/lib/auth/get-session-user'
import { fetchAllRows, toPageResult } from '@/lib/supabase-paginate'
import type { QuizReportQuestionsResult } from './quiz-report'
import { PAGE_SIZE } from './quiz-report'
import { buildAnswerKeyMap, buildDistinctQuestionOrder } from './quiz-report-helpers'
import {
  fetchAnswerKeys,
  selectPageAnswers,
  selectPageQuestions,
} from './quiz-report-questions-fetch'
import { type AnswerRow, buildReportQuestions, type QuestionRow } from './report-question-builder'

export async function getQuizReportQuestions(opts: {
  sessionId: string
  page: number
}): Promise<QuizReportQuestionsResult> {
  const { sessionId, page } = opts
  if (!sessionId) return { ok: false, error: 'Failed to load questions' }
  const supabase = await createServerSupabaseClient()

  const user = await getSessionUser()
  if (!user) return { ok: false, error: 'Failed to load questions' }

  // Verify session ownership and completion guard
  const { data: sessionData, error: sessionError } = await supabase
    .from('quiz_sessions')
    .select('id, ended_at')
    .eq('id', sessionId)
    .eq('student_id', user.id)
    .is('deleted_at', null)
    .maybeSingle()

  if (sessionError) {
    console.error('[getQuizReportQuestions] Session query error:', sessionError.message)
    return { ok: false, error: 'Failed to load questions' }
  }
  const session = sessionData as { id: string; ended_at: string | null } | null
  if (!session) return { ok: false, error: 'Failed to load questions' }
  // Only serve questions for completed sessions — prevents mid-session answer exposure
  if (!session.ended_at) return { ok: false, error: 'Failed to load questions' }

  // Paginate by QUESTION, not by answer row. A dialog_fill question has N answer
  // rows (one per blank); a .range() over rows would split a question across page
  // boundaries and emit a duplicate questionId on two pages. So we first resolve
  // the session's DISTINCT question_ids in display order (answered_at — the order
  // the report has always used), slice that list to the page window, then fetch
  // ALL answer rows for those questions. totalCount = distinct question count.
  // Page through ALL answer rows: the multi-row non-MC types (dialog_fill blanks, ordering
  // slots, diagram_label zones) store one row per blank/slot/zone, and a session can
  // hold up to 500 questions, exceeding PostgREST's max_rows cap. A single
  // .select() would silently truncate, dropping question_ids from the order/total.
  const { data: orderRows, error: orderError } = await fetchAllRows<{ question_id: string }>(
    () =>
      supabase
        .from('quiz_session_answers')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', sessionId),
    async (from, to) => {
      const { data, error } = await supabase
        .from('quiz_session_answers')
        .select('question_id, answered_at')
        .eq('session_id', sessionId)
        .order('answered_at', { ascending: true })
        .order('id')
        .range(from, to)
      return toPageResult<{ question_id: string }>(data, error, 'quiz_session_answers')
    },
  )
  if (orderError) {
    console.error('[getQuizReportQuestions] Order query error:', orderError.message)
    return { ok: false, error: 'Failed to load questions' }
  }
  const orderedQuestionIds = buildDistinctQuestionOrder(orderRows)
  const total = orderedQuestionIds.length
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // page < 1 would make `from` negative and slice the tail — reject it like an
  // out-of-range page. Callers route through parsePageParam (clamps ≥1), so this
  // is defense-in-depth for direct/library callers.
  if (page < 1 || total === 0 || page > totalPages) {
    return { ok: true, questions: [], totalCount: total }
  }

  const from = (page - 1) * PAGE_SIZE
  const pageQuestionIds = orderedQuestionIds.slice(from, from + PAGE_SIZE)

  const [answersResult, questionsResult] = await Promise.all([
    selectPageAnswers(supabase, sessionId, pageQuestionIds),
    selectPageQuestions(supabase, pageQuestionIds),
  ])
  const { data: answersData, error: answersError } = answersResult

  if (answersError) {
    console.error('[getQuizReportQuestions] Answers query error:', answersError.message)
    return { ok: false, error: 'Failed to load questions' }
  }

  const answers = Array.isArray(answersData) ? (answersData as AnswerRow[]) : []

  if (!answers.length) {
    return { ok: true, questions: [], totalCount: total }
  }

  const { data: questionsData, error: questionsError } = questionsResult
  if (questionsError) {
    console.error('[getQuizReportQuestions] Questions query error:', questionsError.message)
    return { ok: false, error: 'Failed to load questions' }
  }

  const questions = Array.isArray(questionsData) ? (questionsData as QuestionRow[]) : []
  const questionMap = new Map<string, QuestionRow>(questions.map((q) => [q.id, q]))

  const [correctResult, keysResult] = await Promise.all([
    supabase.rpc('get_report_correct_options', { p_session_id: sessionId }),
    fetchAnswerKeys(supabase, sessionId),
  ])
  const { data: correctData, error: rpcError } = correctResult
  if (rpcError) {
    console.error('[getQuizReportQuestions] RPC error:', rpcError.message)
    return { ok: false, error: 'Failed to load questions' }
  }
  const correct = toPageResult<{ question_id: string; correct_option_id: string }>(
    correctData,
    null,
    'get_report_correct_options',
  )
  if (correct.error) {
    console.error('[getQuizReportQuestions]', correct.error.message)
    return { ok: false, error: 'Failed to load questions' }
  }
  const correctRows = correct.data ?? []
  const correctMap = new Map<string, string>(
    correctRows.map((row) => [row.question_id, row.correct_option_id]),
  )

  const { data: answerKeyRows, error: keyError } = keysResult
  if (keyError) {
    console.error('[getQuizReportQuestions] Answer-keys RPC error:', keyError.message)
    return { ok: false, error: 'Failed to load questions' }
  }
  const answerKeyMap = buildAnswerKeyMap(answerKeyRows)

  const reportQuestions = buildReportQuestions(answers, questionMap, correctMap, answerKeyMap)

  return { ok: true, questions: reportQuestions, totalCount: total }
}
