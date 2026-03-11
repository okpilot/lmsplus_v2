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

export type StartReviewResult =
  | { success: true; sessionId: string; questionIds: string[] }
  | { success: false; error: string }

export type SubmitAnswerResult =
  | {
      success: true
      isCorrect: boolean
      correctOptionId: string
      explanationText: string | null
      explanationImageUrl: string | null
    }
  | { success: false; error: string }

export type CompleteReviewResult =
  | { success: true; totalQuestions: number; correctCount: number; scorePercentage: number }
  | { success: false; error: string }
