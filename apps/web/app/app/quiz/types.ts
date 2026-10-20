import type { DiagramMappingEntry } from '@/app/app/quiz/actions/diagram-validation'
import type { FilteredCounts } from '@/lib/queries/discovery-counts'
import type { TopicWithSubtopics } from '@/lib/queries/quiz-query-types'

export type SubmitRpcResult = {
  is_correct: boolean
  correct_option_id: string
  explanation_text: string | null
  explanation_image_url: string | null
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
  | {
      questionType: 'diagram_label'
      isCorrect: boolean
      /** Canonical zone_id -> label_id mapping (ids only; the client resolves
       * display text from the delivered zones/labels arrays). */
      correctMapping: DiagramMappingEntry[]
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
  | {
      success: true
      questionType: 'diagram_label'
      isCorrect: boolean
      /** Canonical zone_id -> label_id mapping (ids only; the client resolves
       * display text from the delivered zones/labels arrays). */
      correctMapping: DiagramMappingEntry[]
      explanationText: string | null
      explanationImageUrl: string | null
    }
  | { success: false; error: string }

export type DraftAnswer = {
  selectedOptionId?: string
  responseText?: string
  blankAnswers?: { index: number; text: string }[]
  order?: string[]
  mapping?: DiagramMappingEntry[]
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

export type LoadDraftsResult = { drafts: DraftData[] }

export type QuizMode = 'discovery' | 'study' | 'exam'

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

/** Server-preloaded setup data: lets subject changes on /app/quiz run without a request. */
export type QuizSetupPreload = {
  topicsBySubject: Record<string, TopicWithSubtopics[]>
  /** Discovery counts by subject id, then by `filterSetKey` of the active filters. */
  discoveryCounts: Record<string, Record<string, FilteredCounts>>
}

/** A resolved preload with the client time it arrived, for expiring the per-student counts. */
export type StampedPreload = QuizSetupPreload & { loadedAt: number }

/** The preload as streamed from the server: a Promise prop the form never awaits. */
export type PreloadPromise = Promise<QuizSetupPreload>
