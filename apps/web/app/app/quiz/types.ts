import type { ActionResult } from '@/lib/action-result'

export type SubmitRpcResult = {
  is_correct: boolean
  correct_option_id: string
  explanation_text: string | null
  explanation_image_url: string | null
}[]

export type CompleteRpcResult = {
  total_questions: number
  correct_count: number
  score_percentage: number
}[]

export type StartQuizResult =
  | { success: true; sessionId: string; questionIds: string[] }
  | { success: false; error: string }

export type SubmitQuizAnswerResult =
  | {
      success: true
      isCorrect: boolean
      correctOptionId: string
      explanationText: string | null
      explanationImageUrl: string | null
    }
  | { success: false; error: string }

export type CompleteQuizResult =
  | { success: true; totalQuestions: number; correctCount: number; scorePercentage: number }
  | { success: false; error: string }

type BatchAnswerResult = {
  questionId: string
  isCorrect: boolean
  correctOptionId: string
  explanationText: string | null
  explanationImageUrl: string | null
}

export type BatchSubmitResult =
  | {
      success: true
      totalQuestions: number
      answeredCount: number
      correctCount: number
      scorePercentage: number
      results: BatchAnswerResult[]
      passed?: boolean | null
      expired?: boolean
    }
  | { success: false; error: string }

export type BatchRpcResult = {
  results: {
    question_id: string
    is_correct: boolean
    correct_option_id: string
    explanation_text: string | null
    explanation_image_url: string | null
  }[]
  total_questions: number
  answered_count: number
  correct_count: number
  score_percentage: number
  passed?: boolean | null
  expired?: boolean
}

export type CheckAnswerResult =
  | {
      success: true
      isCorrect: boolean
      correctOptionId: string
      explanationText: string | null
      explanationImageUrl: string | null
    }
  | { success: false; error: string }

// Per-blank grading result for dialog_fill (from check_non_mc_answer's
// `blanks` array). `canonical` is the revealed correct answer for that blank.
export type DialogBlankResult = {
  index: number
  isCorrect: boolean
  canonical: string
}

// Discriminated on `questionType` (camelCase TS-layer tag). The question ROW
// keeps snake_case `question_type` — this asymmetry is intentional: the row is
// the DB contract, the feedback union is the client contract.
//
// The multiple_choice variant's shape is byte-identical to the legacy
// AnswerFeedback (only the discriminant is added) so existing MC consumers and
// persisted localStorage/draft rows keep working.
export type AnswerFeedback =
  | {
      questionType: 'multiple_choice'
      isCorrect: boolean
      correctOptionId: string
      explanationText: string | null
      explanationImageUrl: string | null
    }
  | {
      questionType: 'short_answer'
      isCorrect: boolean
      correctAnswer: string | null
      explanationText: string | null
      explanationImageUrl: string | null
    }
  | {
      questionType: 'dialog_fill'
      isCorrect: boolean
      blanks: DialogBlankResult[]
      explanationText: string | null
      explanationImageUrl: string | null
    }
  | {
      questionType: 'ordering'
      isCorrect: boolean
      /** Canonical order as item ids (unambiguous; the client maps ids → text). */
      correctOrder: string[]
      explanationText: string | null
      explanationImageUrl: string | null
    }

export type CheckNonMcAnswerResult =
  | {
      success: true
      questionType: 'short_answer'
      isCorrect: boolean
      correctAnswer: string | null
      explanationText: string | null
      explanationImageUrl: string | null
    }
  | {
      success: true
      questionType: 'dialog_fill'
      isCorrect: boolean
      blanks: DialogBlankResult[]
      explanationText: string | null
      explanationImageUrl: string | null
    }
  | {
      success: true
      questionType: 'ordering'
      isCorrect: boolean
      /** Canonical order as item ids (unambiguous; the client maps ids → text). */
      correctOrder: string[]
      explanationText: string | null
      explanationImageUrl: string | null
    }
  | { success: false; error: string }

export type DraftAnswer = {
  selectedOptionId?: string
  responseText?: string
  blankAnswers?: { index: number; text: string }[]
  order?: string[]
  responseTimeMs: number
}

export type DraftData = {
  id: string
  sessionId: string
  questionIds: string[]
  answers: Record<string, DraftAnswer>
  feedback?: Record<string, AnswerFeedback>
  currentIndex: number
  subjectName?: string
  subjectCode?: string
  createdAt?: string
}

export type DraftResult = ActionResult

export type LoadDraftsResult = { drafts: DraftData[] }

export type QuizStateOpts = {
  userId: string
  sessionId: string
  questions: import('@/app/app/_types/session').SessionQuestion[]
  initialAnswers?: Record<string, DraftAnswer>
  initialFeedback?: Map<string, AnswerFeedback>
  initialIndex?: number
  draftId?: string
  subjectName?: string
  subjectCode?: string
  mode?: QuizMode
  examMode?: import('@/lib/constants/exam-modes').QuizMode
  timeLimitSeconds?: number
  passMark?: number
  startedAt?: string
}

export type AnswerPipelineOpts = QuizStateOpts & {
  getQuestionId: () => string
  getAnswerStartTime: () => number
  getCurrentIndex: () => number
  answers: Map<string, DraftAnswer>
  setAnswers: React.Dispatch<React.SetStateAction<Map<string, DraftAnswer>>>
  answersRef: React.RefObject<Map<string, DraftAnswer>>
  currentIndexRef: React.RefObject<number>
  navigateTo: (idx: number) => void
  router: import('next/dist/shared/lib/app-router-context.shared-runtime').AppRouterInstance
}

export type QuizMode = 'study' | 'exam'

export type StartExamResult =
  | {
      success: true
      sessionId: string
      questionIds: string[]
      totalQuestions: number
      timeLimitSeconds: number
      passMark: number
      startedAt: string
    }
  | { success: false; error: string }

export type QuestionFilterValue = 'all' | 'unseen' | 'incorrect' | 'flagged'

export type CalcMode = 'all' | 'only' | 'exclude'

// Tri-state filter on whether a question carries an image (#864). Same shape as
// CalcMode: 'only' = image questions only, 'exclude' = hide them, 'all' = default.
export type ImageMode = 'all' | 'only' | 'exclude'

export type UseQuizStartOpts = {
  userId: string
  subjectId: string
  subjects: import('@/lib/queries/quiz-query-types').SubjectOption[]
  count: number
  maxQuestions: number
  filters: QuestionFilterValue[]
  calcMode: CalcMode
  imageMode: ImageMode
  topicTree: {
    getSelectedTopicIds: () => string[]
    getSelectedSubtopicIds: () => string[]
  }
}

export type FilteredCountState = {
  filteredCount: number | null
  filteredByTopic: Record<string, number> | null
  filteredBySubtopic: Record<string, number> | null
  isFilterPending: boolean
  authError: boolean
  refetch: (
    subjectId: string,
    topicIds: string[],
    subtopicIds: string[],
    filters: QuestionFilterValue[],
    calcMode?: CalcMode,
    imageMode?: ImageMode,
  ) => void
  reset: () => void
}

export type CompleteEmptyExamResult =
  | { success: true; sessionId: string }
  | { success: false; error: string }
