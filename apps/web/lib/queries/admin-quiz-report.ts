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
  score_percentage: number | null
  student_id: string
}

export async function getAdminQuizReportSummary(
  sessionId: string,
): Promise<AdminQuizReportSummary | null> {
  const { organizationId } = await requireAdmin()

  const { data: sessionData, error: sessionError } = await adminClient
    .from('quiz_sessions')
    .select(
      'id, mode, subject_id, started_at, ended_at, total_questions, correct_count, score_percentage, student_id',
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
  if (session.subject_id) {
    const { data: subjectData, error: subjectError } = await adminClient
      .from('easa_subjects')
      .select('name')
      .eq('id', session.subject_id)
      .maybeSingle()
    if (subjectError) {
      console.error('[getAdminQuizReportSummary] Subject lookup error:', subjectError.message)
    }
    subjectName = (subjectData as { name: string } | null)?.name ?? null
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
    totalQuestions: session.total_questions,
    answeredCount: answeredCount ?? session.total_questions,
    correctCount: session.correct_count,
    scorePercentage: session.score_percentage ?? 0,
    startedAt: session.started_at,
    endedAt: session.ended_at,
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

  if (total === 0 || page > totalPages) {
    return { ok: true, questions: [], totalCount: total }
  }

  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

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

  // Direct SELECT on questions.options includes the raw `correct` boolean in the DB response,
  // but this is admin-only code (requireAdmin + is_admin RPC), the session is verified complete
  // (ended_at guard), and buildReportQuestions strips `correct` — only `correctOptionId` is returned.
  // Omits deleted_at intentionally — historical record for completed sessions.
  const { data: questionsData, error: questionsError } = await adminClient
    .from('questions')
    .select('id, question_text, question_number, options, explanation_text, explanation_image_url')
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
