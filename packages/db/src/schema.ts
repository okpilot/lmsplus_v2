import { z } from 'zod'

// Note: z.uuid() returns ZodUUID (not ZodString) in Zod v4.
// Inferred TS type is still `string`. Do not instanceof-check against ZodString.

export const SubmitAnswerSchema = z.object({
  sessionId: z.uuid(),
  questionId: z.uuid(),
  selectedOptionId: z.enum(['a', 'b', 'c', 'd']),
  responseTimeMs: z.number().int().positive(),
})

export type SubmitAnswerInput = z.infer<typeof SubmitAnswerSchema>

export const StartQuizSessionSchema = z.object({
  mode: z.enum(['smart_review', 'quick_quiz', 'mock_exam']),
  subjectId: z.uuid().nullable(),
  topicId: z.uuid().nullable(),
  questionIds: z.array(z.uuid()).min(1),
})

export type StartQuizSessionInput = z.infer<typeof StartQuizSessionSchema>

export const CompleteQuizSessionSchema = z.object({
  sessionId: z.uuid(),
})

export type CompleteQuizSessionInput = z.infer<typeof CompleteQuizSessionSchema>

// --- Admin: Syllabus CRUD schemas ---

export const UpsertSubjectSchema = z.object({
  id: z.uuid().optional(),
  code: z.string().min(1).max(10),
  name: z.string().min(1).max(200),
  short: z.string().min(1).max(50),
  sort_order: z.number().int().min(0).optional(),
})

export type UpsertSubjectInput = z.infer<typeof UpsertSubjectSchema>

export const UpsertTopicSchema = z.object({
  id: z.uuid().optional(),
  subject_id: z.uuid(),
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(200),
  sort_order: z.number().int().min(0).optional(),
})

export type UpsertTopicInput = z.infer<typeof UpsertTopicSchema>

export const UpsertSubtopicSchema = z.object({
  id: z.uuid().optional(),
  topic_id: z.uuid(),
  code: z.string().min(1).max(30),
  name: z.string().min(1).max(200),
  sort_order: z.number().int().min(0).optional(),
})

export type UpsertSubtopicInput = z.infer<typeof UpsertSubtopicSchema>

export const DeleteSyllabusItemSchema = z.object({
  id: z.uuid(),
  table: z.enum(['easa_subjects', 'easa_topics', 'easa_subtopics']),
})
