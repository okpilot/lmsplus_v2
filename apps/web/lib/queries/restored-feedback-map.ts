import {
  type DiagramRpcResult,
  type DialogFillRpcResult,
  isDiagramRpcResult,
  isDialogFillRpcResult,
  isOrderingRpcResult,
  isShortAnswerRpcResult,
  type OrderingRpcResult,
  type ShortAnswerRpcResult,
  toClientBlanks,
} from '@/app/app/quiz/actions/check-non-mc-answer-helpers'
import type { AnswerFeedback } from '@/app/app/quiz/types'

type McElement = {
  is_correct: boolean
  correct_option_id: string
  explanation_text: string | null
  explanation_image_url: string | null
}

// Local on purpose: check-answer-helpers keeps its guard file-private (answer-key surface).
function isMcElement(v: Record<string, unknown>): v is McElement {
  const nullableString = (x: unknown) => x === null || typeof x === 'string'
  return (
    typeof v.is_correct === 'boolean' &&
    typeof v.correct_option_id === 'string' &&
    nullableString(v.explanation_text) &&
    nullableString(v.explanation_image_url)
  )
}

type Expl = { explanation_text: string | null; explanation_image_url: string | null }

const expl = (r: Expl) => ({
  explanationText: r.explanation_text,
  explanationImageUrl: r.explanation_image_url,
})

function mapNonMc(type: string, v: Record<string, unknown>): AnswerFeedback | null {
  if (type === 'short_answer' && isShortAnswerRpcResult(v)) return mapShort(v)
  if (type === 'dialog_fill' && isDialogFillRpcResult(v)) return mapDialog(v)
  if (type === 'ordering' && isOrderingRpcResult(v)) return mapOrdering(v)
  if (type === 'diagram_label' && isDiagramRpcResult(v)) return mapDiagram(v)
  return null
}

const mapShort = (r: ShortAnswerRpcResult): AnswerFeedback => ({
  questionType: 'short_answer',
  isCorrect: r.is_correct,
  correctAnswer: r.correct_answer,
  ...expl(r),
})

const mapDialog = (r: DialogFillRpcResult): AnswerFeedback => ({
  questionType: 'dialog_fill',
  isCorrect: r.is_correct,
  blanks: toClientBlanks(r.blanks),
  ...expl(r),
})

const mapOrdering = (r: OrderingRpcResult): AnswerFeedback => ({
  questionType: 'ordering',
  isCorrect: r.is_correct,
  correctOrder: r.correct_order,
  ...expl(r),
})

const mapDiagram = (r: DiagramRpcResult): AnswerFeedback => ({
  questionType: 'diagram_label',
  isCorrect: r.is_correct,
  correctMapping: r.correct_mapping.map((m) => ({ zoneId: m.zone_id, labelId: m.label_id })),
  ...expl(r),
})

/** One `get_restored_feedback` element → the client feedback shape; null when it fails its guard. */
export function toClientFeedback(element: unknown): AnswerFeedback | null {
  if (typeof element !== 'object' || element === null) return null
  const v = element as Record<string, unknown>
  if (v.question_type === 'multiple_choice') {
    if (!isMcElement(v)) return null
    return {
      questionType: 'multiple_choice',
      isCorrect: v.is_correct,
      correctOptionId: v.correct_option_id,
      ...expl(v),
    }
  }
  return typeof v.question_type === 'string' ? mapNonMc(v.question_type, v) : null
}
