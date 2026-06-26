import type {
  AnswerFeedback,
  CalcMode,
  DraftAnswer,
  ImageMode,
  QuestionFilterValue,
  QuizMode,
} from './types'

// The modes a quiz SESSION can run/persist in. Discovery never creates or persists
// a session (it uses the StudyRunner flashcard path), so it is excluded here — this
// keeps the persisted-session contract aligned with the validator in
// session/_utils/quiz-session-validators.ts, which rejects 'discovery'.
export type SessionMode = Exclude<QuizMode, 'discovery'>

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
  mode?: SessionMode
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
