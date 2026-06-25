// Zod input schemas for checkNonMcAnswer. Hoisted out of
// check-non-mc-answer-helpers.ts to keep that file ≤200 lines
// (code-style.md §1).
import { z } from 'zod'

const MAX_DIALOG_BLANKS = 50

// An ordering answer is a permutation — each item id must appear exactly once.
const allUnique = (ids: string[]): boolean => new Set(ids).size === ids.length

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
      .min(2)
      .max(50)
      .refine(allUnique, 'Ordering ids must be unique'),
  })
  .strict()

export const CheckNonMcAnswerSchema = z.union([ShortAnswerInput, DialogFillInput, OrderingInput])
