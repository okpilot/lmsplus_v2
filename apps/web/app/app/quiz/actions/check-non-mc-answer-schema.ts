// Zod input schemas for checkNonMcAnswer. Hoisted out of
// check-non-mc-answer-helpers.ts to keep that file ≤200 lines
// (code-style.md §1).
import { z } from 'zod'
import { diagramIdSchema, isValidDiagramMapping, MAX_ZONES } from './diagram-validation'
import { isUniquePermutation, MAX_ORDER_ITEMS, MIN_ORDER_ITEMS } from './ordering-validation'

const MAX_DIALOG_BLANKS = 50

// `.strict()` rejects a mixed payload ({responseText, blankAnswers}) instead of
// letting z.union strip the extra key and grade it as short_answer.
const ShortAnswerInput = z
  .object({
    questionId: z.uuid(),
    sessionId: z.uuid(),
    responseText: z.string().trim().min(1).max(500),
  })
  .strict()

const DialogFillInput = z
  .object({
    questionId: z.uuid(),
    sessionId: z.uuid(),
    blankAnswers: z
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
      }),
  })
  .strict()

const OrderingInput = z
  .object({
    questionId: z.uuid(),
    sessionId: z.uuid(),
    // Bound array + element length (parity with DialogFillInput blankAnswers caps) — client input.
    // An ordering answer is a permutation, so duplicate ids are invalid.
    order: z
      .array(z.string().min(1).max(200))
      .min(MIN_ORDER_ITEMS)
      .max(MAX_ORDER_ITEMS)
      .refine(isUniquePermutation, 'Ordering ids must be unique'),
  })
  .strict()

const DiagramInput = z
  .object({
    questionId: z.uuid(),
    sessionId: z.uuid(),
    // Bound array + element length (parity with OrderingInput). A diagram
    // mapping is a partial injective function zoneId -> labelId — distinct
    // zoneId AND distinct labelId (a chip is consumed on placement), but
    // (unlike ordering) NOT required to be complete (Decision 52).
    mapping: z
      .array(
        z
          .object({
            // Shared trimmed id schema — parity with the save-draft sibling
            // (draft-schema.ts) and isDiagramMappingEntry.
            zoneId: diagramIdSchema,
            labelId: diagramIdSchema,
          })
          .strict(),
      )
      .min(1)
      .max(MAX_ZONES)
      .refine(
        isValidDiagramMapping,
        'Diagram mapping must have distinct zones and distinct labels',
      ),
  })
  .strict()

export const CheckNonMcAnswerSchema = z.union([
  ShortAnswerInput,
  DialogFillInput,
  OrderingInput,
  DiagramInput,
])
