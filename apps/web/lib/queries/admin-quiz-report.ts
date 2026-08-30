import { adminClient } from '@repo/db/admin'
import { requireAdmin } from '@/lib/auth/require-admin'
import { fetchAllRows } from '@/lib/supabase-paginate'
import { rpc } from '@/lib/supabase-rpc'
import { PAGE_SIZE, type QuizReportQuestionsResult } from './quiz-report'
import {
  type AnswerKeyRow,
  buildAnswerKeyMap,
  buildDistinctQuestionOrder,
} from './quiz-report-helpers'
import type { AdminQuizReportSummary } from './quiz-report-types'
import { type AnswerRow, buildReportQuestions, type QuestionRow } from './report-question-builder'
import { resolveSubjectInfo } from './resolve-subject-info'

type AdminSessionRow = {
  id: string
  mode: string
  subject_id: string | null
  started_at: string
  ended_at: string | null
  total_questions: number
  correct_count: number
  score_percentage: number | string | null
  student_id: string
  passed: boolean | null
  time_limit_seconds: number | null
}

export async function getAdminQuizReportSummary(
  sessionId: string,
): Promise<AdminQuizReportSummary | null> {
  const { organizationId } = await requireAdmin()

  const { data: sessionData, error: sessionError } = await adminClient
    .from('quiz_sessions')
    .select(
      'id, mode, subject_id, started_at, ended_at, total_questions, correct_count, score_percentage, student_id, passed, time_limit_seconds',
    )
    .eq('id', sessionId)
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .maybeSingle()

  if (sessionError) {
    console.error('[getAdminQuizReportSummary] Session query error:', sessionError.message)
    return null
  }
  const session = sessionData as AdminSessionRow | null
  if (!session) return null
  // Only serve reports for completed sessions — prevents mid-session answer exposure
  if (!session.ended_at) return null

  // Session org-membership verified above — sessionId is safe to use unscoped.
  // Derive two counts from the session's answer rows (mirrors quiz-report.ts):
  //  - answeredItems     = total rows (MC/SA = 1/question, dialog_fill = 1/blank)
  //  - answeredQuestions = distinct questions answered (denominator for Skipped)
  // dialog_fill stores one row per blank and a session can hold up to 500 questions
  // (quick_quiz cap) × up to 50 blanks, so this can exceed PostgREST's 1000-row cap —
  // page through with fetchAllRows so the counts never silently truncate.
  const { data: answerRows, error: answerRowsError } = await fetchAllRows<{ question_id: string }>(
    () =>
      adminClient
        .from('quiz_session_answers')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', sessionId),
    (from, to) =>
      adminClient
        .from('quiz_session_answers')
        .select('question_id')
        .eq('session_id', sessionId)
        .order('id', { ascending: true })
        .range(from, to),
  )
  if (answerRowsError) {
    console.error('[getAdminQuizReportSummary] Answer rows query error:', answerRowsError.message)
    return null
  }
  const answeredItems = answerRows.length
  const answeredQuestions = new Set(answerRows.map((r) => r.question_id)).size

  const { subjectName, subjectCode } = await resolveSubjectInfo(
    adminClient,
    session.subject_id,
    '[getAdminQuizReportSummary]',
  )

  const { data: userData, error: userError } = await adminClient
    .from('users')
    .select('full_name')
    .eq('id', session.student_id)
    .maybeSingle()
  if (userError) {
    console.error('[getAdminQuizReportSummary] User lookup error:', userError.message)
  }
  const studentName = (userData as { full_name: string | null } | null)?.full_name ?? null

  return {
    sessionId: session.id,
    mode: session.mode,
    subjectName,
    subjectCode,
    totalQuestions: session.total_questions,
    answeredQuestions,
    answeredItems,
    correctCount: session.correct_count,
    scorePercentage:
      (session.score_percentage != null ? Number(session.score_percentage) : null) ?? 0,
    startedAt: session.started_at,
    endedAt: session.ended_at,
    passed: session.passed,
    timeLimitSeconds: session.time_limit_seconds,
    studentId: session.student_id,
    studentName,
  }
}

export async function getAdminQuizReportQuestions(opts: {
  sessionId: string
  page: number
}): Promise<QuizReportQuestionsResult> {
  const { sessionId, page } = opts
  if (!sessionId) return { ok: false, error: 'Failed to load questions' }

  const { supabase, organizationId } = await requireAdmin()

  // Verify session belongs to org and is completed — prevents mid-session answer exposure
  const { data: sessionData, error: sessionError } = await adminClient
    .from('quiz_sessions')
    .select('id, ended_at')
    .eq('id', sessionId)
    .eq('organization_id', organizationId)
    .is('deleted_at', null)
    .maybeSingle()

  if (sessionError) {
    console.error('[getAdminQuizReportQuestions] Session query error:', sessionError.message)
    return { ok: false, error: 'Failed to load questions' }
  }
  const session = sessionData as { id: string; ended_at: string | null } | null
  if (!session) return { ok: false, error: 'Failed to load questions' }
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
      adminClient
        .from('quiz_session_answers')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', sessionId),
    (from, to) =>
      adminClient
        .from('quiz_session_answers')
        .select('question_id, answered_at')
        .eq('session_id', sessionId)
        .order('answered_at', { ascending: true })
        .order('id')
        .range(from, to),
  )
  if (orderError) {
    console.error('[getAdminQuizReportQuestions] Order query error:', orderError.message)
    return { ok: false, error: 'Failed to load questions' }
  }
  const orderedQuestionIds = buildDistinctQuestionOrder(orderRows)
  const total = orderedQuestionIds.length
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // page < 1 would make `from` negative and slice the tail — reject it like an
  // out-of-range page (mirrors quiz-report-questions.ts). Defense-in-depth: callers
  // route through parsePageParam (clamps ≥1).
  if (page < 1 || total === 0 || page > totalPages) {
    return { ok: true, questions: [], totalCount: total }
  }

  const from = (page - 1) * PAGE_SIZE
  const pageQuestionIds = orderedQuestionIds.slice(from, from + PAGE_SIZE)

  const { data: answersData, error: answersError } = await adminClient
    .from('quiz_session_answers')
    .select(
      'question_id, selected_option_id, is_correct, response_time_ms, response_text, blank_index',
    )
    .eq('session_id', sessionId)
    .in('question_id', pageQuestionIds)
    .order('answered_at', { ascending: true })
    .order('id')

  if (answersError) {
    console.error('[getAdminQuizReportQuestions] Answers query error:', answersError.message)
    return { ok: false, error: 'Failed to load questions' }
  }

  const answers = Array.isArray(answersData) ? (answersData as AnswerRow[]) : []

  if (!answers.length) {
    return { ok: true, questions: [], totalCount: total }
  }

  // options no longer carries the answer key — `correct` is stripped at the DB
  // write layer (#823), so the raw `correct` boolean never reaches this query or
  // buildReportQuestions. The report's correct option comes from
  // get_admin_report_correct_options (correctOptionId). This is admin-only code
  // (requireAdmin + is_admin RPC) and the session is verified complete (ended_at guard).
  // Omits deleted_at intentionally — historical record for completed sessions.
  const { data: questionsData, error: questionsError } = await adminClient
    .from('questions')
    .select(
      'id, question_text, question_number, options, explanation_text, explanation_image_url, question_image_url, question_type',
    )
    .in('id', pageQuestionIds)

  if (questionsError) {
    console.error('[getAdminQuizReportQuestions] Questions query error:', questionsError.message)
    return { ok: false, error: 'Failed to load questions' }
  }

  const questions = Array.isArray(questionsData) ? (questionsData as QuestionRow[]) : []
  const questionMap = new Map<string, QuestionRow>()
  for (const q of questions) {
    questionMap.set(q.id, q)
  }

  // Use supabase (auth client) for RPC — adminClient has no auth.uid() context
  const { data: correctData, error: rpcError } = await supabase.rpc(
    'get_admin_report_correct_options',
    { p_session_id: sessionId },
  )
  if (rpcError) {
    console.error('[getAdminQuizReportQuestions] RPC error:', rpcError.message)
    return { ok: false, error: 'Failed to load questions' }
  }
  const correctRows = Array.isArray(correctData)
    ? (correctData as { question_id: string; correct_option_id: string }[])
    : []
  const correctMap = new Map<string, string>()
  for (const row of correctRows) {
    correctMap.set(row.question_id, row.correct_option_id)
  }

  // Non-MC answer keys (short_answer canonical, dialog_fill per-blank canonicals, ordering
  // per-slot canonicals, diagram_label per-zone canonicals). Returns zero rows for all-MC
  // sessions (e.g. internal_exam) — not an error. get_admin_report_answer_keys (migration 20260824000100)
  // isn't in the generated database types yet, so route through the rpc<T>() wrapper — it
  // invokes `.rpc` on the client directly, preserving the `this`-binding (see
  // lib/supabase-rpc.ts). TODO: drop the explicit type arg once packages/db types are
  // regenerated. Use supabase (auth client) for RPC — adminClient has no auth.uid() context.
  const { data: keyData, error: keyError } = await rpc<AnswerKeyRow[]>(
    supabase,
    'get_admin_report_answer_keys',
    { p_session_id: sessionId },
  )
  if (keyError) {
    console.error('[getAdminQuizReportQuestions] Answer-keys RPC error:', keyError.message)
    return { ok: false, error: 'Failed to load questions' }
  }
  // Runtime guard (code-style §5): only treat an array as rows.
  const answerKeyRows = Array.isArray(keyData) ? keyData : []
  const answerKeyMap = buildAnswerKeyMap(answerKeyRows)

  return {
    ok: true,
    questions: buildReportQuestions(answers, questionMap, correctMap, answerKeyMap),
    totalCount: total,
  }
}
