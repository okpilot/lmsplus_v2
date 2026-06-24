import { createServerSupabaseClient } from '@repo/db/server'
import { fetchAllRows } from '@/lib/supabase-paginate'
import { rpc } from '@/lib/supabase-rpc'
import type { QuizReportQuestionsResult } from './quiz-report'
import { PAGE_SIZE } from './quiz-report'
import {
  type AnswerKeyEntry,
  type AnswerRow,
  buildReportQuestions,
  type QuestionRow,
} from './report-question-builder'

// One row per non-MC answer key from get_report_answer_keys.
//  - short_answer: blank_index NULL, answer_key = the canonical answer.
//  - dialog_fill:  one row per blank, blank_index set, answer_key = blank canonical.
type AnswerKeyRow = {
  question_id: string
  question_type: string
  blank_index: number | null
  answer_key: string | null
}

// Distinct question_ids from the answered-order rows, first-answer order preserved.
function buildDistinctQuestionOrder(orderRows: { question_id: string }[]): string[] {
  const seen = new Set<string>()
  const ordered: string[] = []
  for (const r of orderRows) {
    if (seen.has(r.question_id)) continue
    seen.add(r.question_id)
    ordered.push(r.question_id)
  }
  return ordered
}

// Collapse the flat answer-key rows into a per-question map the builder consumes.
function buildAnswerKeyMap(rows: AnswerKeyRow[]): Map<string, AnswerKeyEntry> {
  const map = new Map<string, AnswerKeyEntry>()
  for (const row of rows) {
    if (row.question_type === 'dialog_fill') {
      const existing = map.get(row.question_id)
      const entry: AnswerKeyEntry =
        existing?.type === 'dialog_fill'
          ? existing
          : { type: 'dialog_fill', canonicalByIndex: new Map<number, string>() }
      if (row.blank_index !== null && row.answer_key !== null) {
        entry.canonicalByIndex.set(row.blank_index, row.answer_key)
      }
      map.set(row.question_id, entry)
    } else {
      // short_answer (and any future single-key type)
      map.set(row.question_id, { type: 'short_answer', canonical: row.answer_key })
    }
  }
  return map
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
  // Page through ALL answer rows: dialog_fill stores one row per blank and a session can
  // hold up to 500 questions × up to 50 blanks, exceeding PostgREST's 1000-row cap. A single
  // .select() would silently truncate, dropping question_ids from the order/total.
  const { data: orderRows, error: orderError } = await fetchAllRows<{ question_id: string }>(
    () =>
      supabase
        .from('quiz_session_answers')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', sessionId),
    (from, to) =>
      supabase
        .from('quiz_session_answers')
        .select('question_id, answered_at')
        .eq('session_id', sessionId)
        .order('answered_at', { ascending: true })
        .order('id')
        .range(from, to),
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

  const { data: answersData, error: answersError } = await supabase
    .from('quiz_session_answers')
    .select(
      'question_id, selected_option_id, is_correct, response_time_ms, response_text, blank_index',
    )
    .eq('session_id', sessionId)
    .in('question_id', pageQuestionIds)
    .order('answered_at', { ascending: true })
    .order('id')

  if (answersError) {
    console.error('[getQuizReportQuestions] Answers query error:', answersError.message)
    return { ok: false, error: 'Failed to load questions' }
  }

  const answers = Array.isArray(answersData) ? (answersData as AnswerRow[]) : []

  if (!answers.length) {
    return { ok: true, questions: [], totalCount: total }
  }

  // Direct SELECT is safe: ended_at guard above blocks mid-session access, and
  // options no longer carries the answer key — `correct` is stripped at the DB
  // write layer (#823), so the key never reaches buildReportQuestions. The
  // report's correct option comes from get_report_correct_options (correctOptionId).
  // Intentionally omits deleted_at — questions answered in a completed session
  // are shown even if subsequently soft-deleted (historical record).
  const { data: questionsData, error: questionsError } = await supabase
    .from('questions')
    .select(
      'id, question_text, question_number, options, explanation_text, explanation_image_url, question_image_url, question_type',
    )
    .in('id', pageQuestionIds)

  if (questionsError) {
    console.error('[getQuizReportQuestions] Questions query error:', questionsError.message)
    return { ok: false, error: 'Failed to load questions' }
  }

  const questions = Array.isArray(questionsData) ? (questionsData as QuestionRow[]) : []
  const questionMap = new Map<string, QuestionRow>(questions.map((q) => [q.id, q]))

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
  const correctMap = new Map<string, string>(
    correctRows.map((row) => [row.question_id, row.correct_option_id]),
  )

  // Non-MC answer keys (short_answer canonical, dialog_fill per-blank canonicals).
  // Returns zero rows for all-MC sessions (e.g. internal_exam) — not an error.
  // get_report_answer_keys (mig 133) isn't in the generated database types yet, so
  // route through the rpc<T>() wrapper — it invokes `.rpc` on the client directly,
  // preserving the `this`-binding (see lib/supabase-rpc.ts). TODO: drop the explicit
  // type arg once packages/db types are regenerated.
  const { data: keyData, error: keyError } = await rpc<AnswerKeyRow[]>(
    supabase,
    'get_report_answer_keys',
    { p_session_id: sessionId },
  )
  if (keyError) {
    console.error('[getQuizReportQuestions] Answer-keys RPC error:', keyError.message)
    return { ok: false, error: 'Failed to load questions' }
  }
  // Runtime guard (code-style §5): only treat an array as rows.
  const answerKeyRows = Array.isArray(keyData) ? keyData : []
  const answerKeyMap = buildAnswerKeyMap(answerKeyRows)

  const reportQuestions = buildReportQuestions(answers, questionMap, correctMap, answerKeyMap)

  return { ok: true, questions: reportQuestions, totalCount: total }
}
