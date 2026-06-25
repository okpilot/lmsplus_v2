export type QuestionType = 'multiple_choice' | 'short_answer' | 'dialog_fill' | 'ordering'

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
  // reorders (canonical sequence hidden; get_quiz_questions mig 136). Null for
  // every other type.
  ordering_items: { id: string; text: string }[] | null
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
