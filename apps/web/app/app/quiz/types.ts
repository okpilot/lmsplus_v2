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

export type BatchAnswerResult = {
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

export type AnswerFeedback = {
  isCorrect: boolean
  correctOptionId: string
  explanationText: string | null
  explanationImageUrl: string | null
}

export type DraftAnswer = { selectedOptionId: string; responseTimeMs: number }

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

export type DraftResult = { success: true } | { success: false; error: string }

export type LoadDraftResult = { draft: DraftData | null }

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
  timeLimitSeconds?: number
  passMark?: number
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
      timeLimitSeconds: number
      passMark: number
    }
  | { success: false; error: string }

export type QuestionFilterValue = 'all' | 'unseen' | 'incorrect' | 'flagged'
