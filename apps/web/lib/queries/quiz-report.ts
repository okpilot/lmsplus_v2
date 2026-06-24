import { createServerSupabaseClient } from '@repo/db/server'

// Fields shared by every question variant in the report. The per-type variants
// below extend this with their type-specific shape (MC options, short-answer
// text, dialog-fill blanks).
export type QuizReportQuestionCommon = {
  questionId: string
  questionText: string
  questionNumber: string | null
  explanationText: string | null
  explanationImageUrl: string | null
  questionImageUrl: string | null
  responseTimeMs: number
}

// One report entry per BLANK of a dialog_fill question.
export type DialogFillBlankResult = {
  index: number
  responseText: string | null
  canonical: string | null
  isCorrect: boolean
}

// Discriminated union on `questionType`. Consumers MUST narrow on it before
// touching any type-specific field (MC `options`, short_answer `responseText`,
// dialog_fill `blanks`). The MC variant is the default the builder emits when a
// row carries no question_type (the admin MC-only feed relies on this).
export type QuizReportQuestion =
  | (QuizReportQuestionCommon & {
      questionType: 'multiple_choice'
      isCorrect: boolean
      // Null for text-answer rows — see AnswerRow in report-question-builder.ts.
      selectedOptionId: string | null
      correctOptionId: string
      options: { id: string; text: string }[]
    })
  | (QuizReportQuestionCommon & {
      questionType: 'short_answer'
      isCorrect: boolean
      responseText: string | null
      canonicalAnswer: string | null
    })
  | (QuizReportQuestionCommon & {
      questionType: 'dialog_fill'
      // True only when every blank is correct.
      isCorrect: boolean
      blanks: DialogFillBlankResult[]
      // Number of correct blanks and total blanks, for the 3-state partial display.
      correctCount: number
      totalBlanks: number
    })

export type QuizReportSummary = {
  sessionId: string
  mode: string
  subjectName: string | null
  totalQuestions: number
  // Distinct questions that received at least one answer — the denominator for Skipped.
  answeredQuestions: number
  // Answer-row count (MC/SA = 1 per question, dialog_fill = 1 per blank) — the
  // denominator for the item-level "Correct" stat.
  answeredItems: number
  // Correct items (correct answer rows), unified with the exam scorer.
  correctCount: number
  scorePercentage: number
  startedAt: string
  endedAt: string | null
  passed: boolean | null
  timeLimitSeconds: number | null
}

export type QuizReportQuestionsResult =
  | { ok: true; questions: QuizReportQuestion[]; totalCount: number }
  | { ok: false; error: string }

export const PAGE_SIZE = 10

type SessionRow = {
  id: string
  mode: string
  subject_id: string | null
  started_at: string
  ended_at: string | null
  total_questions: number
  correct_count: number
  score_percentage: number | string | null
  passed: boolean | null
  time_limit_seconds: number | null
}

export async function getQuizReportSummary(sessionId: string): Promise<QuizReportSummary | null> {
  const supabase = await createServerSupabaseClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError) {
    console.error('[getQuizReportSummary] Auth error:', authError.message)
    return null
  }
  if (!user) return null

  const { data: sessionData, error: sessionError } = await supabase
    .from('quiz_sessions')
    .select(
      'id, mode, subject_id, started_at, ended_at, total_questions, correct_count, score_percentage, passed, time_limit_seconds',
    )
    .eq('id', sessionId)
    .eq('student_id', user.id)
    .is('deleted_at', null)
    .maybeSingle()

  if (sessionError) {
    console.error('[getQuizReportSummary] Session query error:', sessionError.message)
    return null
  }
  const session = sessionData as SessionRow | null
  if (!session) return null
  // Only serve reports for completed sessions — prevents mid-session answer exposure
  if (!session.ended_at) return null

  // Fetch the answer rows' question_id to derive two counts:
  //  - answeredItems     = total rows (MC/SA = 1/question, dialog_fill = 1/blank)
  //  - answeredQuestions = distinct questions answered (for the Skipped stat)
  // A single session's answer rows are bounded (≤ ~50 questions × a few blanks ≪ 1000),
  // so this non-paginated fetch is safe — no fetchAllRows / truncation concern.
  const { data: answerRowsData, error: answerRowsError } = await supabase
    .from('quiz_session_answers')
    .select('question_id')
    .eq('session_id', sessionId)
  if (answerRowsError) {
    console.error('[getQuizReportSummary] Answer rows query error:', answerRowsError.message)
    return null
  }
  const answerRows = Array.isArray(answerRowsData)
    ? (answerRowsData as { question_id: string }[])
    : []
  const answeredItems = answerRows.length
  const answeredQuestions = new Set(answerRows.map((r) => r.question_id)).size

  // Resolve subject name if available (display-only — don't abort report on failure)
  let subjectName: string | null = null
  if (session.subject_id) {
    const { data: subjectData, error: subjectError } = await supabase
      .from('easa_subjects')
      .select('name')
      .eq('id', session.subject_id)
      .maybeSingle()
    if (subjectError) {
      console.error('[getQuizReportSummary] Subject lookup error:', subjectError.message)
    }
    subjectName = (subjectData as { name: string } | null)?.name ?? null
  }

  return {
    sessionId: session.id,
    mode: session.mode,
    subjectName,
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
  }
}
