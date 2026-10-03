// Zod input schemas for the quiz-progress Server Actions (quiz-progress.ts). Answer fields
// reuse the check-action field schemas so a saved answer is never validated more loosely
// than a checked one.
import { z } from 'zod'
import {
  BlankAnswersField,
  OrderField,
  ResponseTextField,
  TimeSpentMs,
} from './check-non-mc-answer-schema'
import { DiagramMappingSchema } from './diagram-validation'

// Strict members: a mixed payload ({responseText, order}) is rejected, not silently stripped.
const ProgressAnswer = z.union([
  z.object({ selectedOptionId: z.enum(['a', 'b', 'c', 'd']) }).strict(),
  z.object({ responseText: ResponseTextField }).strict(),
  z.object({ blankAnswers: BlankAnswersField }).strict(),
  z.object({ order: OrderField }).strict(),
  z.object({ mapping: DiagramMappingSchema }).strict(),
])

export const SaveAnswerInput = z
  .object({
    sessionId: z.uuid(),
    questionId: z.uuid(),
    deviceId: z.uuid(),
    answer: ProgressAnswer,
    timeSpentMs: TimeSpentMs,
  })
  .strict()

// `leaving` is the question being left plus its visit time: both-or-neither by construction.
export const SavePositionInput = z
  .object({
    sessionId: z.uuid(),
    deviceId: z.uuid(),
    currentIndex: z.number().int().min(0).max(499),
    pinnedQuestionIds: z.array(z.uuid()).max(500),
    leaving: z.object({ questionId: z.uuid(), timeSpentMs: TimeSpentMs }).strict().optional(),
  })
  .strict()

export const ClaimInput = z.object({ sessionId: z.uuid(), deviceId: z.uuid() }).strict()

export type ProgressAnswerInput = z.infer<typeof ProgressAnswer>
export type SaveAnswerInputType = z.infer<typeof SaveAnswerInput>
export type SavePositionInputType = z.infer<typeof SavePositionInput>
export type ClaimInputType = z.infer<typeof ClaimInput>
