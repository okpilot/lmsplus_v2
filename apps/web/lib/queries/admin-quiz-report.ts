import { adminClient } from '@repo/db/admin'
import type { createServerSupabaseClient } from '@repo/db/server'
import { requireAdmin } from '@/lib/auth/require-admin'
import {
  fetchAdminReportAnswerKeyMap,
  fetchAdminReportCorrectOptionsMap,
  fetchPageAnswerRows,
  fetchPageQuestions,
} from './admin-report-helpers'
import { type AdminReportSessionRow, loadAdminReportSession } from './admin-report-session'
import { PAGE_SIZE, type QuizReportQuestionsResult } from './quiz-report'
import { buildDistinctQuestionOrder } from './quiz-report-helpers'
import type { AdminQuizReportSummary } from './quiz-report-types'
import { type AnswerRow, buildReportQuestions, type QuestionRow } from './report-question-builder'
import { resolveSubjectInfo } from './resolve-subject-info'

type AdminAuthClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

type QuestionsFailure = { ok: false; error: string }
const QUESTIONS_FAILED: QuestionsFailure = { ok: false, error: 'Failed to load questions' }

async function fetchStudentName(studentId: string): Promise<string | null> {
  const { data, error } = await adminClient
    .from('users')
    .select('full_name')
    .eq('id', studentId)
    .maybeSingle()
  if (error) {
    console.error('[getAdminQuizReportSummary] User lookup error:', error.message)
  }
  return (data as { full_name: string | null } | null)?.full_name ?? null
}

function toAdminSummary(opts: {
  session: AdminReportSessionRow
  endedAt: string
  counts: { answeredItems: number; answeredQuestions: number }
  subject: { subjectName: string | null; subjectCode: string | null }
  studentName: string | null
}): AdminQuizReportSummary {
  const { session, endedAt, counts, subject, studentName } = opts
  return {
    sessionId: session.id,
    mode: session.mode,
    subjectName: subject.subjectName,
    subjectCode: subject.subjectCode,
    totalQuestions: session.total_questions,
    answeredQuestions: counts.answeredQuestions,
    answeredItems: counts.answeredItems,
    correctCount: session.correct_count,
    scorePercentage:
      (session.score_percentage != null ? Number(session.score_percentage) : null) ?? 0,
    startedAt: session.started_at,
    endedAt,
    passed: session.passed,
    timeLimitSeconds: session.time_limit_seconds,
    studentId: session.student_id,
    studentName,
  }
}

export async function getAdminQuizReportSummary(
  sessionId: string,
): Promise<AdminQuizReportSummary | null> {
  const loaded = await loadAdminReportSession(sessionId)
  if (!loaded.ok) return null
  const { session, answerRows } = loaded
  const endedAt = session.ended_at
  if (!endedAt) return null

  // Two counts from the session's answer rows (mirrors quiz-report.ts):
  //  - answeredItems     = total rows (MC/SA = 1/question, dialog_fill = 1/blank)
  //  - answeredQuestions = distinct questions answered (denominator for Skipped)
  const counts = {
    answeredItems: answerRows.length,
    answeredQuestions: new Set(answerRows.map((r) => r.question_id)).size,
  }
  const [subject, studentName] = await Promise.all([
    resolveSubjectInfo(adminClient, session.subject_id, '[getAdminQuizReportSummary]'),
    fetchStudentName(session.student_id),
  ])
  return toAdminSummary({ session, endedAt, counts, subject, studentName })
}

type AdminPageInputs =
  | { kind: 'error' }
  | { kind: 'empty' }
  | { kind: 'ok'; answers: AnswerRow[]; questionMap: Map<string, QuestionRow> }

async function fetchAdminPageInputs(
  sessionId: string,
  pageQuestionIds: string[],
): Promise<AdminPageInputs> {
  const [answersResult, questionsResult] = await Promise.all([
    fetchPageAnswerRows(sessionId, pageQuestionIds),
    fetchPageQuestions(pageQuestionIds),
  ])
  const { data: answers, error: answersError } = answersResult
  if (answersError) {
    console.error('[getAdminQuizReportQuestions] Answers query error:', answersError.message)
    return { kind: 'error' }
  }
  if (!answers.length) return { kind: 'empty' }

  const { data: questions, error: questionsError } = questionsResult
  if (questionsError) {
    console.error('[getAdminQuizReportQuestions] Questions query error:', questionsError.message)
    return { kind: 'error' }
  }
  return { kind: 'ok', answers, questionMap: new Map(questions.map((q) => [q.id, q])) }
}

// Use supabase (auth client) for both RPCs — adminClient has no auth.uid() context.
// Non-MC keys: short_answer canonical, dialog_fill per-blank, ordering per-slot,
// diagram_label per-zone.
async function fetchAdminKeyMaps(supabase: AdminAuthClient, sessionId: string) {
  const [correctResult, answerKeyResult] = await Promise.all([
    fetchAdminReportCorrectOptionsMap(supabase, sessionId),
    fetchAdminReportAnswerKeyMap(supabase, sessionId),
  ])
  const { data: correctMap, error: correctMapError } = correctResult
  if (correctMapError) {
    console.error('[getAdminQuizReportQuestions] RPC error:', correctMapError.message)
    return null
  }
  const { data: answerKeyMap, error: answerKeyMapError } = answerKeyResult
  if (answerKeyMapError) {
    console.error('[getAdminQuizReportQuestions] Answer-keys RPC error:', answerKeyMapError.message)
    return null
  }
  return { correctMap, answerKeyMap }
}

// Paginate by QUESTION, not by answer row: a dialog_fill question has N answer rows
// (one per blank), so a row window would split a question across pages. totalCount =
// distinct question count, in answered_at order. Returns null for an empty or
// out-of-range page; page < 1 would make `from` negative and slice the tail, so it is
// rejected like an out-of-range page (mirrors quiz-report-questions.ts).
function sliceQuestionPage(orderedQuestionIds: string[], page: number): string[] | null {
  const totalPages = Math.max(1, Math.ceil(orderedQuestionIds.length / PAGE_SIZE))
  if (page < 1 || orderedQuestionIds.length === 0 || page > totalPages) return null
  const from = (page - 1) * PAGE_SIZE
  return orderedQuestionIds.slice(from, from + PAGE_SIZE)
}

export async function getAdminQuizReportQuestions(opts: {
  sessionId: string
  page: number
}): Promise<QuizReportQuestionsResult> {
  const { sessionId, page } = opts
  if (!sessionId) return QUESTIONS_FAILED

  const { supabase } = await requireAdmin()
  const loaded = await loadAdminReportSession(sessionId)
  if (!loaded.ok) return QUESTIONS_FAILED

  const orderedQuestionIds = buildDistinctQuestionOrder(loaded.answerRows)
  const total = orderedQuestionIds.length
  const pageQuestionIds = sliceQuestionPage(orderedQuestionIds, page)
  if (!pageQuestionIds) return { ok: true, questions: [], totalCount: total }

  const [inputs, keys] = await Promise.all([
    fetchAdminPageInputs(sessionId, pageQuestionIds),
    fetchAdminKeyMaps(supabase, sessionId),
  ])
  if (inputs.kind === 'error') return QUESTIONS_FAILED
  if (inputs.kind === 'empty') return { ok: true, questions: [], totalCount: total }
  if (!keys) return QUESTIONS_FAILED
  const questions = buildReportQuestions(
    inputs.answers,
    inputs.questionMap,
    keys.correctMap,
    keys.answerKeyMap,
  )
  return { ok: true, questions, totalCount: total }
}
