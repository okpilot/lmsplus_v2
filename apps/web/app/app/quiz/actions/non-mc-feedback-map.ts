import type { AnswerFeedback } from '../types'
import type {
  DiagramRpcResult,
  DialogFillRpcResult,
  OrderingRpcResult,
  ShortAnswerRpcResult,
} from './check-non-mc-answer-helpers'
import { toClientBlanks } from './check-non-mc-answer-helpers'

type Variant<T extends AnswerFeedback['questionType']> = Extract<
  AnswerFeedback,
  { questionType: T }
>

type Expl = { explanation_text: string | null; explanation_image_url: string | null }

const expl = (r: Expl) => ({
  explanationText: r.explanation_text,
  explanationImageUrl: r.explanation_image_url,
})

export const toShortFeedback = (r: ShortAnswerRpcResult): Variant<'short_answer'> => ({
  questionType: 'short_answer',
  isCorrect: r.is_correct,
  correctAnswer: r.correct_answer,
  ...expl(r),
})

export const toDialogFeedback = (r: DialogFillRpcResult): Variant<'dialog_fill'> => ({
  questionType: 'dialog_fill',
  isCorrect: r.is_correct,
  blanks: toClientBlanks(r.blanks),
  ...expl(r),
})

export const toOrderingFeedback = (r: OrderingRpcResult): Variant<'ordering'> => ({
  questionType: 'ordering',
  isCorrect: r.is_correct,
  correctOrder: r.correct_order,
  ...expl(r),
})

export const toDiagramFeedback = (r: DiagramRpcResult): Variant<'diagram_label'> => ({
  questionType: 'diagram_label',
  isCorrect: r.is_correct,
  correctMapping: r.correct_mapping.map((m) => ({ zoneId: m.zone_id, labelId: m.label_id })),
  ...expl(r),
})
