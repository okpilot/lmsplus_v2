import { z } from 'zod'

// Note: z.uuid() returns ZodUUID (not ZodString) in Zod v4.
// Inferred TS type is still `string`. Do not instanceof-check against ZodString.

export const StartQuizSessionSchema = z.object({
  mode: z.enum(['smart_review', 'quick_quiz', 'mock_exam']),
  subjectId: z.uuid().nullable(),
  topicId: z.uuid().nullable(),
  questionIds: z.array(z.uuid()).min(1),
})

export type StartQuizSessionInput = z.infer<typeof StartQuizSessionSchema>

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
    // MC answer key lives in a dedicated, REVOKE-gated column (#823) — never
    // inside options[]. The DB trigger strips any stray `correct` key on write.
    correct_option_id: z.enum(['a', 'b', 'c', 'd']),
    explanation_text: z.string().trim().min(1).max(10000),
    explanation_image_url: z.url().nullable().optional(),
    difficulty: z.enum(['easy', 'medium', 'hard']),
    status: z.enum(['active', 'draft']),
    has_calculations: z.boolean().default(false),
  })
  .refine((q) => new Set(q.options.map((o) => o.id)).size === 4, {
    message: 'Option IDs must be unique',
  })
  .refine((q) => q.options.some((o) => o.id === q.correct_option_id), {
    message: 'correct_option_id must match an option id',
  })

export type UpsertQuestionInput = z.infer<typeof UpsertQuestionSchema>

export const SoftDeleteQuestionSchema = z.object({
  id: z.uuid(),
})

export const BulkUpdateStatusSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(100),
  status: z.enum(['active', 'draft']),
})

export const BulkUpdateCalculationsSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(100),
  has_calculations: z.boolean(),
})

// --- Admin: Student Management schemas ---

export const CreateStudentSchema = z.object({
  email: z.email(),
  full_name: z.string().trim().min(1).max(200),
  role: z.enum(['student', 'instructor']),
  course_ids: z.array(z.uuid()).max(20).default([]),
})

export type CreateStudentInput = z.infer<typeof CreateStudentSchema>

export const UpdateStudentSchema = z.object({
  id: z.uuid(),
  full_name: z.string().trim().min(1).max(200),
  role: z.enum(['admin', 'instructor', 'student']),
  course_ids: z.array(z.uuid()).max(20).optional(),
})

export type UpdateStudentInput = z.infer<typeof UpdateStudentSchema>

export const ToggleStudentStatusSchema = z.object({
  id: z.uuid(),
})

// --- Admin: Student Groups schemas ---

export const CreateStudentGroupSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional(),
})

export type CreateStudentGroupInput = z.infer<typeof CreateStudentGroupSchema>

export const UpdateStudentGroupSchema = CreateStudentGroupSchema.extend({
  groupId: z.uuid(),
})

export type UpdateStudentGroupInput = z.infer<typeof UpdateStudentGroupSchema>

export const DeleteStudentGroupSchema = z.object({
  groupId: z.uuid(),
})

export const StudentGroupMembersSchema = z.object({
  groupId: z.uuid(),
  userIds: z
    .array(z.uuid())
    .min(1)
    .max(500)
    .refine(
      (ids) => new Set(ids.map((id) => id.toLowerCase())).size === ids.length,
      'Duplicate student ids',
    ),
})

export type StudentGroupMembersInput = z.infer<typeof StudentGroupMembersSchema>

// --- Exam sitting schemas ---

const uuidList = (max: number) =>
  z
    .array(z.uuid())
    .max(max)
    .refine(
      (ids) => new Set(ids.map((id) => id.toLowerCase())).size === ids.length,
      'Duplicate ids',
    )

const SittingTimeSchema = z.iso.datetime({ offset: true })
const SittingModeSchema = z.enum(['remote', 'in_person'])

export const CreateExamSittingSchema = z.object({
  scheduledAt: SittingTimeSchema,
  mode: SittingModeSchema,
  invigilatorId: z.uuid(),
})

export const UpdateExamSittingSchema = z.object({
  sittingId: z.uuid(),
  scheduledAt: SittingTimeSchema.optional(),
  mode: SittingModeSchema.optional(),
  invigilatorId: z.uuid().optional(),
})

export const ExamSittingIdSchema = z.object({ sittingId: z.uuid() })

export const AddSittingCandidatesSchema = z
  .object({
    sittingId: z.uuid(),
    userIds: uuidList(500).default([]),
    groupIds: uuidList(50).default([]),
  })
  .refine((v) => v.userIds.length + v.groupIds.length > 0, 'Select at least one student or group')

export const RemoveSittingCandidatesSchema = z.object({
  sittingId: z.uuid(),
  userIds: uuidList(500).min(1),
})

export const RemoveSittingEntriesSchema = z.object({
  sittingId: z.uuid(),
  entryIds: uuidList(2000).min(1),
})

export const SittingPeopleQuerySchema = z.object({
  sittingId: z.uuid(),
  q: z.string().trim().max(100).optional(),
  groupId: z.uuid().optional(),
  courseId: z.uuid().optional(),
  status: z.enum(['active', 'inactive']).optional(),
  page: z.number().int().min(1).optional(),
})

const SittingPairsRefine = (v: { userIds: string[]; subjectIds: string[] }) =>
  new Set(v.userIds.map((u, i) => `${u.toLowerCase()}:${v.subjectIds[i]?.toLowerCase()}`)).size ===
  v.userIds.length

export const AddSittingEntriesSchema = z
  .object({
    sittingId: z.uuid(),
    userIds: z.array(z.uuid()).min(1).max(1000),
    subjectIds: z.array(z.uuid()).min(1).max(1000),
  })
  .refine((v) => v.userIds.length === v.subjectIds.length, 'Arrays must have equal length')
  .refine(SittingPairsRefine, 'Duplicate pairs')

export const AddSittingExamsSchema = z
  .object({
    sittingId: z.uuid(),
    subjectIds: uuidList(200).min(1),
    userIds: uuidList(500).min(1).optional(),
    all: z.literal(true).optional(),
  })
  .refine((v) => (v.userIds === undefined) !== (v.all === undefined), 'Pick userIds or all')

export const IssueSittingCodesSchema = z.object({
  sittingId: z.uuid(),
  userIds: uuidList(500).min(1).optional(),
  entryIds: uuidList(500).min(1).optional(),
})

/**
 * Tokens the sitting RPCs themselves write to `internal_exam_codes.void_reason`; three readers key
 * on `sitting_cancelled`, so free text reaching that column through `void_sitting_code` must not
 * equal one. `void_internal_exam_code` validates only a blank or over-long reason, so it accepts
 * these tokens (#1820); `voidInternalExamCode` refuses an exact match app-side (`checkSittingCode`)
 * before calling it, for every code. A direct RPC call bypasses that guard.
 * Derive: grep -rhno "void_reason = '[a-z_]*'" supabase/migrations/*.sql, plus the
 * `private.void_unused_sitting_codes` call sites. Mirrored in the RPC's own check (mig 20261118000300).
 */
export const RESERVED_VOID_REASONS = [
  'sitting_closed',
  'sitting_cancelled',
  'entry_removed',
  'reissued_after_expiry',
  'passed_elsewhere',
] as const

export const VoidSittingCodeSchema = z.object({
  sittingId: z.uuid(),
  codeId: z.uuid(),
  reason: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .refine((r) => !(RESERVED_VOID_REASONS as readonly string[]).includes(r), {
      message: 'reason must not be a system void reason',
    }),
})

export const SubjectEligibilityQuerySchema = z.object({
  sittingId: z.uuid(),
  userIds: uuidList(100).min(1).optional(),
})

export const RosterQuerySchema = z.object({
  sittingId: z.uuid(),
  q: z.string().trim().max(100).optional(),
  page: z.number().int().min(1).optional(),
  show: z.enum(['all', 'needs_code', 'not_emailed', 'has_attempts']).optional(),
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
