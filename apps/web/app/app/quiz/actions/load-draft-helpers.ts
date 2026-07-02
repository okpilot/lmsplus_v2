// Pure row-mapping + feedback validation/normalization for loadDrafts.
// Hoisted out of load-draft.ts to keep the Server Action file under the
// 100-line cap (code-style.md §1). No `'use server'` — these are pure transforms.
import type { Database } from '@repo/db/types'
import type { AnswerFeedback, DialogBlankResult, DraftAnswer, DraftData } from '../types'
import { isUniquePermutation, MAX_ORDER_ITEMS, MIN_ORDER_ITEMS } from './ordering-validation'

type QuizDraftRow = Database['public']['Tables']['quiz_drafts']['Row']
type SessionConfig = { sessionId: string; subjectName?: string; subjectCode?: string }

function isSessionConfig(v: unknown): v is SessionConfig {
  if (typeof v !== 'object' || v === null) return false
  const r = v as Record<string, unknown>
  if (typeof r.sessionId !== 'string') return false
  if (r.subjectName !== undefined && typeof r.subjectName !== 'string') return false
  if (r.subjectCode !== undefined && typeof r.subjectCode !== 'string') return false
  return true
}

function isDialogBlankResult(b: unknown): boolean {
  if (typeof b !== 'object' || b === null) return false
  const r = b as Record<string, unknown>
  return (
    Number.isInteger(r.index) &&
    (r.index as number) >= 0 &&
    typeof r.isCorrect === 'boolean' &&
    typeof r.canonical === 'string'
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
      // Require a non-empty correctOptionId so this load-path validation matches
      // the sessionStorage rehydrate path (isValidFeedbackEntry → isNonEmptyString);
      // otherwise an entry could load here but be voided on rehydrate.
      return typeof r.correctOptionId === 'string' && r.correctOptionId !== ''
        ? { questionType: 'multiple_choice', correctOptionId: r.correctOptionId, ...base }
        : null
    case 'short_answer':
      return r.correctAnswer === null || typeof r.correctAnswer === 'string'
        ? { questionType: 'short_answer', correctAnswer: r.correctAnswer as string | null, ...base }
        : null
    case 'dialog_fill':
      // Deep per-element blanks check applied here too (symmetric with the
      // localStorage path in quiz-session-validators isValidDialogFillFeedback):
      // a single malformed blank voids the whole record rather than casting a
      // partially-typed array through. `length > 0` matches that validator, the
      // save schema (draft-schema .min(1)) and the RPC guard (isDialogFillRpcResult)
      // — an empty blanks array is corrupt, since dialog_fill always grades ≥1 blank.
      return Array.isArray(r.blanks) && r.blanks.length > 0 && r.blanks.every(isDialogBlankResult)
        ? { questionType: 'dialog_fill', blanks: r.blanks as DialogBlankResult[], ...base }
        : null
    case 'ordering':
      // Sibling-validator parity (agent-semantic-reviewer.md, count=3): mirror the
      // ordering branch of isValidFeedbackEntry (sessionStorage rehydrate) + the
      // draft-schema save union (.min(2) + unique) — a correctOrder array of ≥2
      // unique non-empty strings (an ordering question always has ≥2 items, and the
      // canonical order is a permutation so the ids are unique). Without this case the
      // load path returned null for ordering and toFeedbackRecord discarded the
      // WHOLE draft's feedback on resume.
      return Array.isArray(r.correctOrder) &&
        r.correctOrder.length >= MIN_ORDER_ITEMS &&
        // Upper-bound parity with the same family (.max(50)) — a tampered DB draft
        // with >50 ids is corrupt.
        r.correctOrder.length <= MAX_ORDER_ITEMS &&
        r.correctOrder.every((s) => typeof s === 'string' && s.length > 0) &&
        isUniquePermutation(r.correctOrder as string[])
        ? { questionType: 'ordering', correctOrder: r.correctOrder as string[], ...base }
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
