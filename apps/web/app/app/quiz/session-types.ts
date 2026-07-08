import type { QuestionType } from '@/app/app/_types/session'
import type {
  AnswerFeedback,
  CalcMode,
  DraftAnswer,
  ImageMode,
  QuestionFilterValue,
  QuizMode,
} from './types'

// The modes a quiz SESSION can render in. Discovery reuses the exact session runner
// (browse-only, pre-marked correct option, nothing scored) via an ephemeral handoff,
// so it is a valid SessionMode. It never PERSISTS, however: the localStorage
// active-session firewall (session/_utils/quiz-session-storage.ts readActiveSession)
// still rejects a persisted mode: 'discovery'.
export type SessionMode = QuizMode

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
  // RT setup's single-select type filter (Slice 3). Undefined on the quiz/exam
  // path (type-agnostic start) — mirrors calcMode/imageMode threading.
  questionType?: QuestionType
  topicTree: {
    getSelectedTopicIds: () => string[]
    getSelectedSubtopicIds: () => string[]
  }
}

// Params for useQuizConfig — extracted so the hook's own signature stays within
// the 80-line hook budget (code-style.md §1) once questionType threading is added.
export type UseQuizConfigOpts = {
  userId: string
  subjects: import('@/lib/queries/quiz-query-types').SubjectOption[]
  initialSubjectId?: string
  initialMode?: QuizMode
  initialTopics?: import('@/lib/queries/quiz-query-types').TopicWithSubtopics[]
}

export type UseStudyStartOpts = {
  userId: string
  subjectId: string
  subjects: import('@/lib/queries/quiz-query-types').SubjectOption[]
  count: number
  maxQuestions: number
  filters?: QuestionFilterValue[]
  calcMode?: CalcMode
  imageMode?: ImageMode
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
    // Study/Discovery passes 'multiple_choice' so the count matches the MC-only
    // fetch; the RT setup's single-select type filter (Slice 3) can pass any of
    // the 5 types; the quiz/exam paths omit it (type-agnostic count) (#1008).
    questionType?: QuestionType,
  ) => void
  reset: () => void
}
