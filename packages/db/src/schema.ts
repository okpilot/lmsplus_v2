import { z } from 'zod'

export const SubmitAnswerSchema = z.object({
  sessionId: z.string().uuid(),
  questionId: z.string().uuid(),
  selectedOptionId: z.enum(['a', 'b', 'c', 'd']),
  responseTimeMs: z.number().int().positive(),
})

export type SubmitAnswerInput = z.infer<typeof SubmitAnswerSchema>

export const StartQuizSessionSchema = z.object({
  mode: z.enum(['smart_review', 'quick_quiz', 'mock_exam']),
  subjectId: z.string().uuid().nullable(),
  topicId: z.string().uuid().nullable(),
  questionIds: z.array(z.string().uuid()).min(1),
})

export type StartQuizSessionInput = z.infer<typeof StartQuizSessionSchema>

export const CompleteQuizSessionSchema = z.object({
  sessionId: z.string().uuid(),
})

export type CompleteQuizSessionInput = z.infer<typeof CompleteQuizSessionSchema>
