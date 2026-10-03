// Zod input schemas for checkNonMcAnswer. Hoisted out of
// check-non-mc-answer-helpers.ts to keep that file ≤200 lines
// (code-style.md §1).
import { z } from 'zod'
import { DiagramMappingSchema } from './diagram-validation'
import { isUniquePermutation, MAX_ORDER_ITEMS, MIN_ORDER_ITEMS } from './ordering-validation'

const MAX_DIALOG_BLANKS = 50

/** Visit time in ms, bounded by the 24 h cap the progress RPCs enforce (`invalid_time_spent`). */
export const TimeSpentMs = z.number().int().min(0).max(86_400_000)

// Optional progress-save metadata the check RPCs forward as p_device_id / p_time_spent_ms.
export const ProgressMetaShape = {
  deviceId: z.uuid().optional(),
  timeSpentMs: TimeSpentMs.optional(),
}

// Answer-field schemas shared with quiz-progress-schema.ts, so a saved answer is never
// validated more loosely than a checked one.
export const ResponseTextField = z.string().trim().min(1).max(500)

export const BlankAnswersField = z
  .array(
    z.object({
      index: z.number().int().min(0).max(9999),
      text: z.string().trim().min(1).max(200),
    }),
  )
  .min(1)
  .max(MAX_DIALOG_BLANKS)
  .superRefine((answers, ctx) => {
    const seen = new Set<number>()
    for (const [position, a] of answers.entries()) {
      if (seen.has(a.index)) {
        ctx.addIssue({
          code: 'custom',
          path: [position, 'index'],
          message: 'Duplicate blank index',
        })
      }
      seen.add(a.index)
    }
  })

// Bound array + element length (parity with the blank-answers caps) — client input.
// An ordering answer is a permutation, so duplicate ids are invalid.
export const OrderField = z
  .array(z.string().trim().min(1).max(200))
  .min(MIN_ORDER_ITEMS)
  .max(MAX_ORDER_ITEMS)
  .refine(isUniquePermutation, 'Ordering ids must be unique')

// `.strict()` rejects a mixed payload ({responseText, blankAnswers}) instead of
// letting z.union strip the extra key and grade it as short_answer.
const ShortAnswerInput = z
  .object({
    questionId: z.uuid(),
    sessionId: z.uuid(),
    responseText: ResponseTextField,
    ...ProgressMetaShape,
  })
  .strict()

const DialogFillInput = z
  .object({
    questionId: z.uuid(),
    sessionId: z.uuid(),
    blankAnswers: BlankAnswersField,
    ...ProgressMetaShape,
  })
  .strict()

const OrderingInput = z
  .object({
    questionId: z.uuid(),
    sessionId: z.uuid(),
    order: OrderField,
    ...ProgressMetaShape,
  })
  .strict()

const DiagramInput = z
  .object({
    questionId: z.uuid(),
    sessionId: z.uuid(),
    // A diagram mapping is a partial injective function zoneId -> labelId — distinct
    // zoneId AND distinct labelId (a chip is consumed on placement), but (unlike ordering)
    // NOT required to be complete (Decision 52). Shared schema — parity with the
    // save-draft sibling (draft-schema.ts).
    mapping: DiagramMappingSchema,
    ...ProgressMetaShape,
  })
  .strict()

export type ShortAnswerCheckInput = z.infer<typeof ShortAnswerInput>
export type DialogFillCheckInput = z.infer<typeof DialogFillInput>
export type OrderingCheckInput = z.infer<typeof OrderingInput>
export type DiagramCheckInput = z.infer<typeof DiagramInput>

export const CheckNonMcAnswerSchema = z.union([
  ShortAnswerInput,
  DialogFillInput,
  OrderingInput,
  DiagramInput,
])
