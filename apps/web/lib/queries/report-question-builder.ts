import type { QuizReportQuestion } from './quiz-report'

export type AnswerRow = {
  question_id: string
  selected_option_id: string
  is_correct: boolean
  response_time_ms: number
}

export type QuestionRow = {
  id: string
  question_text: string
  question_number: string | null
  options: { id: string; text: string }[]
  explanation_text: string | null
  explanation_image_url: string | null
}

export function buildReportQuestions(
  answers: AnswerRow[],
  questionMap: Map<string, QuestionRow>,
  correctMap: Map<string, string>,
): QuizReportQuestion[] {
  return answers.map((answer) => {
    const question = questionMap.get(answer.question_id)
    const options = question?.options ?? []

    return {
      questionId: answer.question_id,
      questionText: question?.question_text ?? '',
      questionNumber: question?.question_number ?? null,
      isCorrect: answer.is_correct,
      selectedOptionId: answer.selected_option_id,
      correctOptionId: correctMap.get(answer.question_id) ?? '',
      options: options.map((o) => ({ id: o.id, text: o.text })),
      explanationText: question?.explanation_text ?? null,
      explanationImageUrl: question?.explanation_image_url ?? null,
      responseTimeMs: answer.response_time_ms,
    }
  })
}
