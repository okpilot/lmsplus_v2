import {
  isUniquePermutation,
  MAX_ORDER_ITEMS,
  MIN_ORDER_ITEMS,
} from '@/app/app/quiz/actions/ordering-validation'
import {
  type DiagramConfigRow,
  isDiagramConfig,
  toDiagramConfigRow,
} from './load-session-diagram-guards'

export type QuizQuestionRow = {
  id: string
  question_text: string
  question_image_url: string | null
  question_number: string | null
  // Optional: get_vfr_rt_exam_questions returns neither explanation column.
  explanation_text?: string | null
  explanation_image_url?: string | null
  options: unknown
  question_type: 'multiple_choice' | 'short_answer' | 'dialog_fill' | 'ordering' | 'diagram_label'
  dialog_template: string | null
  blanks_safe: unknown
  ordering_items_shuffled: unknown
  diagram_config_public: unknown
}

export type LoadedQuestion = {
  id: string
  question_text: string
  question_image_url: string | null
  question_number: string | null
  explanation_text: string | null
  explanation_image_url: string | null
  options: { id: string; text: string }[]
  question_type: 'multiple_choice' | 'short_answer' | 'dialog_fill' | 'ordering' | 'diagram_label'
  dialog_template: string | null
  blanks_safe: { index: number }[] | null
  ordering_items: { id: string; text: string }[] | null
  diagram_config: DiagramConfigRow | null
}

export type LoadResult =
  | { success: true; questions: LoadedQuestion[] }
  | { success: false; error: string }

// Element-level guard for the ordering_items_shuffled RPC payload (#998 CR). Array.isArray
// alone would admit a malformed array whose elements lack string id/text and pass it through
// as trusted ordering items; this narrows the cast per code-style §5 (pair a cast with a
// runtime guard). CHECK-enforced server-side (mig 143; since #1045, mig 20260928000100 also
// requires id = ordering_item_id(text)), so this is defense-in-depth against future RPC drift.
function isOrderingItem(value: unknown): value is { id: string; text: string } {
  if (typeof value !== 'object' || value === null) return false
  const { id, text } = value as { id?: unknown; text?: unknown }
  // Mirrors the DB CHECK's non-blank intent only (stays trim-based; the DB alone enforces the
  // id = ordering_item_id(text) hash). A blank id breaks id-keyed grading, a blank text renders
  // an empty draggable slot — reject empty/whitespace-only strings, not just non-strings.
  return (
    typeof id === 'string' &&
    id.trim().length > 0 &&
    typeof text === 'string' &&
    text.trim().length > 0
  )
}

function isOrderingItemArray(value: unknown): value is { id: string; text: string }[] {
  if (
    !Array.isArray(value) ||
    value.length < MIN_ORDER_ITEMS ||
    value.length > MAX_ORDER_ITEMS ||
    !value.every(isOrderingItem)
  )
    return false
  return isUniquePermutation(value.map((v) => v.id))
}

export function toQuestion(q: QuizQuestionRow): LoadedQuestion {
  return {
    id: q.id,
    question_text: q.question_text,
    question_image_url: q.question_image_url,
    question_number: q.question_number,
    explanation_text: q.explanation_text ?? null,
    explanation_image_url: q.explanation_image_url ?? null,
    options: Array.isArray(q.options) ? (q.options as { id: string; text: string }[]) : [],
    question_type: q.question_type,
    dialog_template: q.dialog_template,
    blanks_safe: Array.isArray(q.blanks_safe) ? (q.blanks_safe as { index: number }[]) : null,
    ordering_items: isOrderingItemArray(q.ordering_items_shuffled)
      ? q.ordering_items_shuffled
      : null,
    diagram_config: isDiagramConfig(q.diagram_config_public)
      ? toDiagramConfigRow(q.diagram_config_public)
      : null,
  }
}
