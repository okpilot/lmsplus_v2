import { adminClient } from '@repo/db/admin'
import { requireAdmin } from '@/lib/auth/require-admin'
import {
  fetchAdminReportAnswerKeyMap,
  fetchAdminReportCorrectOptionsMap,
  fetchAdminSessionForReport,
  fetchPageAnswerRows,
  fetchPageQuestions,
  fetchSessionAnswerRows,
} from './admin-report-helpers'
import { PAGE_SIZE, type QuizReportQuestionsResult } from './quiz-report'
import { buildDistinctQuestionOrder } from './quiz-report-helpers'
import type { AdminQuizReportSummary } from './quiz-report-types'
import { buildReportQuestions, type QuestionRow } from './report-question-builder'
import { resolveSubjectInfo } from './resolve-subject-info'

type AdminSessionGuard = { id: string; ended_at: string | null }
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

  const { data: session, error: sessionError } = await fetchAdminSessionForReport<AdminSessionRow>({
    sessionId,
    organizationId,
    select:
      'id, mode, subject_id, started_at, ended_at, total_questions, correct_count, score_percentage, student_id, passed, time_limit_seconds',
    logPrefix: '[getAdminQuizReportSummary]',
  })
  if (sessionError) return null
  // Not found, or not yet completed — prevents mid-session answer exposure
  if (!session?.ended_at) return null

  // Session org-membership verified above — sessionId is safe to use unscoped.
  // Derive two counts from the session's answer rows (mirrors quiz-report.ts):
  //  - answeredItems     = total rows (MC/SA = 1/question, dialog_fill = 1/blank)
  //  - answeredQuestions = distinct questions answered (denominator for Skipped)
  // EVERY non-MC type stores one row per blank/slot/zone (dialog_fill blanks, ordering
  // slots, diagram_label zones — 50 max each), so a 500-question quick_quiz can exceed
  // PostgREST's 1000-row cap — page through so the counts never silently truncate.
  const { data: answerRows, error: answerRowsError } = await fetchSessionAnswerRows<{
    question_id: string
  }>({ sessionId, select: 'question_id', orderColumns: ['id'] })
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
  const { data: session, error: sessionError } =
    await fetchAdminSessionForReport<AdminSessionGuard>({
      sessionId,
      organizationId,
      select: 'id, ended_at',
      logPrefix: '[getAdminQuizReportQuestions]',
    })
  if (sessionError) return { ok: false, error: 'Failed to load questions' }
  // Not found, or not yet completed — prevents mid-session answer exposure
  if (!session?.ended_at) return { ok: false, error: 'Failed to load questions' }

  // Paginate by QUESTION, not by answer row. A dialog_fill question has N answer
  // rows (one per blank); a .range() over rows would split a question across page
  // boundaries and emit a duplicate questionId on two pages. So we first resolve
  // the session's DISTINCT question_ids in display order (answered_at — the order
  // the report has always used), slice that list to the page window, then fetch
  // ALL answer rows for those questions. totalCount = distinct question count.
  // Page through ALL answer rows: EVERY non-MC type stores one row per blank/slot/zone
  // (dialog_fill, ordering, diagram_label — 50 max each), so 500 questions can exceed
  // PostgREST's 1000-row cap; a single .select() would truncate, dropping question_ids.
  const { data: orderRows, error: orderError } = await fetchSessionAnswerRows<{
    question_id: string
  }>({ sessionId, select: 'question_id, answered_at', orderColumns: ['answered_at', 'id'] })
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

  const { data: answers, error: answersError } = await fetchPageAnswerRows(
    sessionId,
    pageQuestionIds,
  )
  if (answersError) {
    console.error('[getAdminQuizReportQuestions] Answers query error:', answersError.message)
    return { ok: false, error: 'Failed to load questions' }
  }

  if (!answers.length) {
    return { ok: true, questions: [], totalCount: total }
  }

  const { data: questions, error: questionsError } = await fetchPageQuestions(pageQuestionIds)
  if (questionsError) {
    console.error('[getAdminQuizReportQuestions] Questions query error:', questionsError.message)
    return { ok: false, error: 'Failed to load questions' }
  }

  const questionMap = new Map<string, QuestionRow>(questions.map((q) => [q.id, q]))

  // Use supabase (auth client) for RPC — adminClient has no auth.uid() context
  const { data: correctMap, error: correctMapError } = await fetchAdminReportCorrectOptionsMap(
    supabase,
    sessionId,
  )
  if (correctMapError) {
    console.error('[getAdminQuizReportQuestions] RPC error:', correctMapError.message)
    return { ok: false, error: 'Failed to load questions' }
  }

  // Non-MC answer keys (short_answer canonical, dialog_fill per-blank canonicals, ordering
  // per-slot canonicals, diagram_label per-zone canonicals). Use supabase (auth client) for
  // RPC — adminClient has no auth.uid() context.
  const { data: answerKeyMap, error: answerKeyMapError } = await fetchAdminReportAnswerKeyMap(
    supabase,
    sessionId,
  )
  if (answerKeyMapError) {
    console.error('[getAdminQuizReportQuestions] Answer-keys RPC error:', answerKeyMapError.message)
    return { ok: false, error: 'Failed to load questions' }
  }

  return {
    ok: true,
    questions: buildReportQuestions(answers, questionMap, correctMap, answerKeyMap),
    totalCount: total,
  }
}
