// Input schemas for recheckRestoredAnswers. No 'use server': the Server Action file may only
// export async functions, and the client imports RECHECK_CHUNK from here.
import { z } from 'zod'
import { BlankAnswersField, OrderField, ResponseTextField } from './check-non-mc-answer-schema'
import { DiagramMappingSchema } from './diagram-validation'

/** Answers per call: bounds one Server Action queue slot to one batch of check RPCs. */
export const RECHECK_CHUNK = 25

const QuestionId = z.uuid()

// `.strict()` rejects a mixed answer instead of letting a union strip a key and grade the rest.
// No `timeSpentMs`: a re-check must leave the stored visit time untouched.
export const RecheckItemSchema = z.union([
  z.object({ questionId: QuestionId, selectedOptionId: z.enum(['a', 'b', 'c', 'd']) }).strict(),
  z.object({ questionId: QuestionId, responseText: ResponseTextField }).strict(),
  z.object({ questionId: QuestionId, blankAnswers: BlankAnswersField }).strict(),
  z.object({ questionId: QuestionId, order: OrderField }).strict(),
  z.object({ questionId: QuestionId, mapping: DiagramMappingSchema }).strict(),
])

// Items are parsed one by one, so a single bad answer does not discard the batch.
export const RecheckEnvelopeSchema = z
  .object({
    sessionId: z.uuid(),
    deviceId: z.uuid(),
    answers: z.array(z.unknown()).min(1).max(RECHECK_CHUNK),
  })
  .strict()

export type RecheckItem = z.infer<typeof RecheckItemSchema>
