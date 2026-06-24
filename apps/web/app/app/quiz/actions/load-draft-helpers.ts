// Pure row-mapping + feedback validation/normalization for loadDrafts.
// Hoisted out of load-draft.ts to keep the Server Action file under the
// 100-line cap (code-style.md §1). No `'use server'` — these are pure transforms.
import type { Database } from '@repo/db/types'
import type { AnswerFeedback, DialogBlankResult, DraftAnswer, DraftData } from '../types'

type QuizDraftRow = Database['public']['Tables']['quiz_drafts']['Row']
type SessionConfig = { sessionId: string; subjectName?: string; subjectCode?: string }

function isSessionConfig(v: unknown): v is SessionConfig {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as Record<string, unknown>).sessionId === 'string'
  )
}

// Validates a persisted feedback entry and returns a tagged AnswerFeedback, or
// null if malformed. Legacy pre-discriminant MC feedback has no `questionType`
// (case undefined) but carries a string `correctOptionId`; it is normalized to
// the tagged `multiple_choice` variant so the returned record genuinely
// satisfies the discriminated AnswerFeedback type (closing the type hole that
// let untagged feedback fail the `=== 'multiple_choice'` narrow downstream).
function toFeedbackEntry(e: unknown): AnswerFeedback | null {
  if (typeof e !== 'object' || e === null) return null
  const r = e as Record<string, unknown>
  if (typeof r.isCorrect !== 'boolean') return null
  const base = {
    isCorrect: r.isCorrect,
    explanationText: typeof r.explanationText === 'string' ? r.explanationText : null,
    explanationImageUrl: typeof r.explanationImageUrl === 'string' ? r.explanationImageUrl : null,
  }
  switch (r.questionType) {
    case 'multiple_choice':
    case undefined:
      return typeof r.correctOptionId === 'string'
        ? { questionType: 'multiple_choice', correctOptionId: r.correctOptionId, ...base }
        : null
    case 'short_answer':
      return r.correctAnswer === null || typeof r.correctAnswer === 'string'
        ? { questionType: 'short_answer', correctAnswer: r.correctAnswer as string | null, ...base }
        : null
    case 'dialog_fill':
      // Shallow blanks check is deliberate: this guards the trusted-ish DB draft
      // row. The localStorage path (quiz-session-validators isValidDialogFillFeedback)
      // does the deep per-blank shape check, since that source is client-writable.
      return Array.isArray(r.blanks)
        ? { questionType: 'dialog_fill', blanks: r.blanks as DialogBlankResult[], ...base }
        : null
    default:
      return null
  }
}

function toFeedbackRecord(v: unknown): Record<string, AnswerFeedback> | undefined {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return undefined
  const out: Record<string, AnswerFeedback> = {}
  for (const [k, e] of Object.entries(v)) {
    const entry = toFeedbackEntry(e)
    if (!entry) return undefined
    out[k] = entry
  }
  return out
}

export function rowToDraftData(row: QuizDraftRow): DraftData {
  const raw = row.session_config
  const rawFeedback = (row as unknown as { feedback?: unknown }).feedback
  const feedback = toFeedbackRecord(rawFeedback)
  if (!isSessionConfig(raw)) {
    console.error('[rowToDraftData] Malformed session_config on draft', row.id)
    return {
      id: row.id,
      sessionId: '',
      questionIds: row.question_ids,
      answers: row.answers as Record<string, DraftAnswer>,
      feedback,
      currentIndex: row.current_index,
      subjectName: undefined,
      subjectCode: undefined,
      createdAt: row.created_at,
    }
  }
  const config = raw
  return {
    id: row.id,
    sessionId: config.sessionId,
    questionIds: row.question_ids,
    answers: row.answers as Record<string, DraftAnswer>,
    feedback,
    currentIndex: row.current_index,
    subjectName: config.subjectName,
    subjectCode: config.subjectCode,
    createdAt: row.created_at,
  }
}
