import { adminClient } from '@repo/db/admin'
import { requireAdmin } from '@/lib/auth/require-admin'
import type { QuizReportQuestionsResult, QuizReportSummary } from './quiz-report'
import { PAGE_SIZE } from './quiz-report'
import { type AnswerRow, buildReportQuestions, type QuestionRow } from './report-question-builder'

export type AdminQuizReportSummary = QuizReportSummary & {
  studentId: string
  studentName: string | null
}

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

  // Session org-membership verified above — sessionId is safe to use unscoped
  const { count: answeredCount, error: countError } = await adminClient
    .from('quiz_session_answers')
    .select('question_id', { count: 'exact', head: true })
    .eq('session_id', sessionId)
  if (countError) {
    console.error('[getAdminQuizReportSummary] Count query error:', countError.message)
    return null
  }

  let subjectName: string | null = null
  let subjectCode: string | null = null
  if (session.subject_id) {
    const { data: subjectData, error: subjectError } = await adminClient
      .from('easa_subjects')
      .select('name, code')
      .eq('id', session.subject_id)
      .maybeSingle()
    if (subjectError) {
      console.error('[getAdminQuizReportSummary] Subject lookup error:', subjectError.message)
    }
    const subject = subjectData as { name: string; code: string } | null
    subjectName = subject?.name ?? null
    subjectCode = subject?.code ?? null
  }

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
    // KNOWN LIMITATION (#991): the generic admin session route can reach non-MC
    // sessions, which this path does not yet support. answeredCount is the raw
    // answer-ROW count. For a non-MC session that makes answeredItems correct (items
    // === rows: one row per blank for dialog_fill) but answeredQuestions WRONG — it
    // should be COUNT(DISTINCT question_id), not the row count. MC sessions (the only
    // non-dormant producer today) are correct on both: one row per question ⇒ rows ===
    // questions === items.
    answeredQuestions: answeredCount ?? session.total_questions,
    answeredItems: answeredCount ?? session.total_questions,
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

  const { count: totalCount, error: countError } = await adminClient
    .from('quiz_session_answers')
    .select('question_id', { count: 'exact', head: true })
    .eq('session_id', sessionId)

  if (countError) {
    console.error('[getAdminQuizReportQuestions] Count query error:', countError.message)
    return { ok: false, error: 'Failed to load questions' }
  }

  const total = totalCount ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // page < 1 would make `from` negative and slice the tail — reject it like an
  // out-of-range page (mirrors quiz-report-questions.ts). Defense-in-depth: callers
  // route through parsePageParam (clamps ≥1).
  if (page < 1 || total === 0 || page > totalPages) {
    return { ok: true, questions: [], totalCount: total }
  }

  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  // KNOWN LIMITATION (#991): row-based .range() pagination is correct ONLY for MC
  // sessions (one answer row per question). The generic admin session route CAN reach
  // non-MC sessions, where a dialog_fill question's per-blank rows straddle a page
  // boundary and duplicate the questionId across pages. Proper fix = mirror the student
  // path's distinct-question pagination (quiz-report-questions.ts) AND add an admin
  // answer-keys RPC. Unreachable today: the non-MC producer (/app/vfr-rt) is dormant.
  const { data: answersData, error: answersError } = await adminClient
    .from('quiz_session_answers')
    .select('question_id, selected_option_id, is_correct, response_time_ms')
    .eq('session_id', sessionId)
    .order('answered_at', { ascending: true })
    .order('id')
    .range(from, to)

  if (answersError) {
    console.error('[getAdminQuizReportQuestions] Answers query error:', answersError.message)
    return { ok: false, error: 'Failed to load questions' }
  }

  const answers = Array.isArray(answersData) ? (answersData as AnswerRow[]) : []

  if (!answers.length) {
    return { ok: true, questions: [], totalCount: total }
  }

  const questionIds = answers.map((a) => a.question_id)

  // options no longer carries the answer key — `correct` is stripped at the DB
  // write layer (#823), so the raw `correct` boolean never reaches this query or
  // buildReportQuestions. The report's correct option comes from
  // get_admin_report_correct_options (correctOptionId). This is admin-only code
  // (requireAdmin + is_admin RPC) and the session is verified complete (ended_at guard).
  // Omits deleted_at intentionally — historical record for completed sessions.
  const { data: questionsData, error: questionsError } = await adminClient
    .from('questions')
    .select(
      'id, question_text, question_number, options, explanation_text, explanation_image_url, question_image_url',
    )
    .in('id', questionIds)

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

  return {
    ok: true,
    questions: buildReportQuestions(answers, questionMap, correctMap),
    totalCount: total,
  }
}
