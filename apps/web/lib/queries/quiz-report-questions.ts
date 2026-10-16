import { createServerSupabaseClient } from '@repo/db/server'
import { toPageResult } from '@/lib/supabase-paginate'
import type { QuizReportQuestionsResult } from './quiz-report'
import { PAGE_SIZE } from './quiz-report'
import { buildAnswerKeyMap, buildDistinctQuestionOrder } from './quiz-report-helpers'
import {
  fetchAnswerKeys,
  selectPageAnswers,
  selectPageQuestions,
} from './quiz-report-questions-fetch'
import { loadReportSession } from './quiz-report-session'
import { type AnswerRow, buildReportQuestions, type QuestionRow } from './report-question-builder'

type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>
type Failure = { ok: false; error: string }

const LOAD_FAILED: Failure = { ok: false, error: 'Failed to load questions' }

function failed(message: string, detail: string): Failure {
  console.error(`[getQuizReportQuestions] ${message}`, detail)
  return LOAD_FAILED
}

// Paginate by QUESTION, not by answer row. A dialog_fill question has N answer
// rows (one per blank); a .range() over rows would split a question across page
// boundaries and emit a duplicate questionId on two pages. So the session's
// DISTINCT question_ids are resolved in display order (answered_at — the order
// the report has always used), sliced to the page window, then ALL answer rows
// for those questions are fetched. totalCount = distinct question count.
// page < 1 would make `from` negative and slice the tail — reject it like an
// out-of-range page. Callers route through parsePageParam (clamps ≥1), so this
// is defense-in-depth for direct/library callers.
function pageWindow(orderedIds: string[], page: number): string[] | null {
  const totalPages = Math.max(1, Math.ceil(orderedIds.length / PAGE_SIZE))
  if (page < 1 || orderedIds.length === 0 || page > totalPages) return null
  const from = (page - 1) * PAGE_SIZE
  return orderedIds.slice(from, from + PAGE_SIZE)
}

type PageRows = { answers: AnswerRow[]; questionMap: Map<string, QuestionRow> }

async function loadPageRows(
  supabase: SupabaseClient,
  sessionId: string,
  pageQuestionIds: string[],
): Promise<PageRows | Failure> {
  const [answersResult, questionsResult] = await Promise.all([
    selectPageAnswers(supabase, sessionId, pageQuestionIds),
    selectPageQuestions(supabase, pageQuestionIds),
  ])
  if (answersResult.error) return failed('Answers query error:', answersResult.error.message)
  const answers = Array.isArray(answersResult.data) ? (answersResult.data as AnswerRow[]) : []
  if (!answers.length) return { answers, questionMap: new Map() }

  if (questionsResult.error) return failed('Questions query error:', questionsResult.error.message)
  const questions = Array.isArray(questionsResult.data)
    ? (questionsResult.data as QuestionRow[])
    : []
  return { answers, questionMap: new Map(questions.map((q) => [q.id, q])) }
}

type AnswerKeys = {
  correctMap: Map<string, string>
  answerKeyMap: ReturnType<typeof buildAnswerKeyMap>
}

async function loadAnswerKeys(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<AnswerKeys | Failure> {
  const [correctResult, keysResult] = await Promise.all([
    supabase.rpc('get_report_correct_options', { p_session_id: sessionId }),
    fetchAnswerKeys(supabase, sessionId),
  ])
  if (correctResult.error) return failed('RPC error:', correctResult.error.message)
  const correct = toPageResult<{ question_id: string; correct_option_id: string }>(
    correctResult.data,
    null,
    'get_report_correct_options',
  )
  if (correct.error) return failed('RPC error:', correct.error.message)
  if (keysResult.error) return failed('Answer-keys RPC error:', keysResult.error.message)

  const correctMap = new Map<string, string>(
    (correct.data ?? []).map((row) => [row.question_id, row.correct_option_id]),
  )
  return { correctMap, answerKeyMap: buildAnswerKeyMap(keysResult.data) }
}

export async function getQuizReportQuestions(opts: {
  sessionId: string
  page: number
}): Promise<QuizReportQuestionsResult> {
  const { sessionId, page } = opts
  if (!sessionId) return LOAD_FAILED

  const loaded = await loadReportSession(sessionId)
  if (!loaded.ok) return LOAD_FAILED

  const orderedQuestionIds = buildDistinctQuestionOrder(loaded.answerRows)
  const total = orderedQuestionIds.length
  const pageQuestionIds = pageWindow(orderedQuestionIds, page)
  if (!pageQuestionIds) return { ok: true, questions: [], totalCount: total }

  const supabase = await createServerSupabaseClient()
  const [rows, keys] = await Promise.all([
    loadPageRows(supabase, sessionId, pageQuestionIds),
    loadAnswerKeys(supabase, sessionId),
  ])
  if ('ok' in rows) return rows
  if (!rows.answers.length) return { ok: true, questions: [], totalCount: total }
  if ('ok' in keys) return keys

  const questions = buildReportQuestions(
    rows.answers,
    rows.questionMap,
    keys.correctMap,
    keys.answerKeyMap,
  )
  return { ok: true, questions, totalCount: total }
}
