export type QuestionType =
  | 'multiple_choice'
  | 'short_answer'
  | 'dialog_fill'
  | 'ordering'
  | 'diagram_label'

// Single-select RT question-type filter (Slice 3). All 5 types the DB question_type
// column supports — used by the VFR RT setup's QuestionTypeFilter picker. The value
// array + label map are UI-layer only; the Zod enums in lookup.ts/start.ts declare
// their own literal lists independently (mirrors the CalcMode/ImageMode convention —
// no shared runtime const feeds those schemas). Co-located with QuestionType (not
// quiz/types.ts) since both quiz and VFR RT UI import them (code-style.md §1).
export const QUESTION_TYPES: readonly QuestionType[] = [
  'multiple_choice',
  'short_answer',
  'dialog_fill',
  'ordering',
  'diagram_label',
]

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  multiple_choice: 'Multiple Choice',
  short_answer: 'Short Answer',
  dialog_fill: 'Fill in the Blank',
  ordering: 'Ordering',
  diagram_label: 'Diagram',
}

type DiagramZone = { id: string; x: number; y: number; w: number; h: number }
type DiagramLabelChip = { id: string; text: string }
// Public (answer-stripped) delivery shape for a diagram_label question —
// mirrors get_quiz_questions' diagram_config_public jsonb (mig 152). `answer`
// (the zone_id -> label_id key) is OMITTED entirely; labels arrive shuffled.
type DiagramConfigPublic = {
  image_ref: string
  zones: DiagramZone[]
  labels: DiagramLabelChip[]
}

export type SessionQuestion = {
  id: string
  question_text: string
  question_image_url: string | null
  question_number: string | null
  options: { id: string; text: string }[]
  explanation_text: string | null
  explanation_image_url: string | null
  // Populated by loadSessionQuestions (get_quiz_questions RPC) for every
  // question — non-nullable so the runner can discriminate on question_type
  // without a fallback. dialog_template/blanks_safe are non-null only for the
  // matching type; multiple_choice carries (null, null).
  question_type: QuestionType
  dialog_template: string | null
  blanks_safe: { index: number }[] | null
  // Populated for `ordering` only — the shuffled {id, text} items the student
  // reorders (canonical sequence hidden; get_quiz_questions mig 145). Null for
  // every other type.
  ordering_items: { id: string; text: string }[] | null
  // Populated for `diagram_label` only — the delivered {image_ref, zones,
  // labels(shuffled)} config (answer key stripped; get_quiz_questions mig 152).
  // Null for every other type.
  diagram_config: DiagramConfigPublic | null
}

export type AnswerResult =
  | {
      success: true
      isCorrect: boolean
      correctOptionId: string
      explanationText: string | null
      explanationImageUrl: string | null
    }
  | { success: false; error: string }

export type CompleteResult =
  | { success: true; totalQuestions: number; correctCount: number; scorePercentage: number }
  | { success: false; error: string }

export type SubmitInput = {
  sessionId: string
  questionId: string
  selectedOptionId: string
  responseTimeMs: number
}

export type SessionState = 'answering' | 'feedback' | 'complete'

export type UseSessionStateOpts = {
  sessionId: string
  questions: SessionQuestion[]
  onSubmitAnswer: (input: SubmitInput) => Promise<AnswerResult>
  onComplete: (input: { sessionId: string }) => Promise<CompleteResult>
}
