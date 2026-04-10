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

// --- Admin: Question CRUD schemas ---

const OptionInputSchema = z.object({
  id: z.enum(['a', 'b', 'c', 'd']),
  text: z.string().trim().min(1),
  correct: z.boolean(),
})

export const UpsertQuestionSchema = z
  .object({
    id: z.uuid().optional(),
    subject_id: z.uuid(),
    topic_id: z.uuid(),
    subtopic_id: z.uuid().nullable(),
    question_number: z.string().max(50).nullable().optional(),
    lo_reference: z.string().max(100).nullable().optional(),
    question_text: z.string().trim().min(1).max(10000),
    question_image_url: z.url().nullable().optional(),
    options: z.array(OptionInputSchema).length(4),
    explanation_text: z.string().trim().min(1).max(10000),
    explanation_image_url: z.url().nullable().optional(),
    difficulty: z.enum(['easy', 'medium', 'hard']),
    status: z.enum(['active', 'draft']),
  })
  .refine((q) => q.options.filter((o) => o.correct).length === 1, {
    message: 'Exactly one option must be marked correct',
  })
  .refine((q) => new Set(q.options.map((o) => o.id)).size === 4, {
    message: 'Option IDs must be unique',
  })

export type UpsertQuestionInput = z.infer<typeof UpsertQuestionSchema>

export const SoftDeleteQuestionSchema = z.object({
  id: z.uuid(),
})

export const BulkUpdateStatusSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(100),
  status: z.enum(['active', 'draft']),
})

// --- Admin: Student Management schemas ---

export const CreateStudentSchema = z.object({
  email: z.email(),
  full_name: z.string().trim().min(1).max(200),
  role: z.enum(['student', 'instructor']),
  temporary_password: z.string().min(6).max(72),
})

export type CreateStudentInput = z.infer<typeof CreateStudentSchema>

export const UpdateStudentSchema = z.object({
  id: z.uuid(),
  full_name: z.string().trim().min(1).max(200),
  role: z.enum(['admin', 'instructor', 'student']),
})

export type UpdateStudentInput = z.infer<typeof UpdateStudentSchema>

export const ResetStudentPasswordSchema = z.object({
  id: z.uuid(),
  temporary_password: z.string().min(6).max(72),
})

export type ResetStudentPasswordInput = z.infer<typeof ResetStudentPasswordSchema>

export const ToggleStudentStatusSchema = z.object({
  id: z.uuid(),
})

// --- Admin: Exam Config schemas ---

const ExamConfigDistributionSchema = z.object({
  topicId: z.uuid(),
  subtopicId: z.uuid().nullable().optional(),
  questionCount: z.number().int().positive(),
})

export type ExamConfigDistributionInput = z.infer<typeof ExamConfigDistributionSchema>

export const UpsertExamConfigSchema = z
  .object({
    subjectId: z.uuid(),
    enabled: z.boolean(),
    totalQuestions: z.number().int().positive().max(200),
    timeLimitSeconds: z.number().int().positive().max(14400), // max 4 hours
    passMark: z.number().int().positive().max(100),
    distributions: z.array(ExamConfigDistributionSchema).min(1),
  })
  .refine(
    (c) => {
      const sum = c.distributions.reduce((acc, d) => acc + d.questionCount, 0)
      return sum === c.totalQuestions
    },
    { message: 'Distribution question counts must sum to total questions' },
  )

export type UpsertExamConfigInput = z.infer<typeof UpsertExamConfigSchema>

export const ToggleExamConfigSchema = z.object({
  subjectId: z.uuid(),
  enabled: z.boolean(),
})
