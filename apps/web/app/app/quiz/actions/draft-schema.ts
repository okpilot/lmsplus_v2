// Zod input schema for saveDraft. Hoisted out of draft.ts to keep the Server
// Action file under the 100-line cap (code-style.md §1).
//
// The answer-payload bounds mirror the grading schema (CheckNonMcAnswerSchema in
// check-non-mc-answer-schema.ts) — responseText `.trim().min(1).max(500)` and
// each dialog blank's text `.trim().min(1).max(200)`, plus blankAnswers `.max(50)`
// + duplicate-index rejection — so a draft can never persist a payload the grader
// would later reject on resume.
import { z } from 'zod'

export const SaveDraftInput = z
  .object({
    draftId: z.uuid().optional(),
    sessionId: z.uuid(),
    questionIds: z.array(z.uuid()).min(1),
    answers: z.record(
      z.string(),
      z
        .object({
          selectedOptionId: z.string().min(1).optional(),
          responseText: z.string().trim().min(1).max(500).optional(),
          blankAnswers: z
            .array(
              z.object({
                index: z.number().int().min(0).max(9999),
                text: z.string().trim().min(1).max(200),
              }),
            )
            .min(1)
            .max(50)
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
            .optional(),
          // Bound the array + element length (parity with blankAnswers .max(50) /
          // text .max(200)) — client input parsed in a Server Action; ids are short.
          // An ordering answer is a permutation, so duplicate ids are invalid.
          order: z
            .array(z.string().min(1).max(200))
            .min(2)
            .max(50)
            .refine((ids) => new Set(ids).size === ids.length, 'Ordering ids must be unique')
            .optional(),
          responseTimeMs: z.number().int().nonnegative(),
        })
        // Exactly one answer payload must be present (MC / short / dialog / ordering).
        .refine(
          (a) =>
            [a.selectedOptionId, a.responseText, a.blankAnswers, a.order].filter(
              (x) => x !== undefined,
            ).length === 1,
          { message: 'Draft answer must carry exactly one answer payload' },
        ),
    ),
    currentIndex: z.number().int().nonnegative(),
    subjectName: z.string().max(100).optional(),
    subjectCode: z.string().max(10).optional(),
    feedback: z
      .record(
        z.string(),
        z.discriminatedUnion('questionType', [
          z.object({
            questionType: z.literal('multiple_choice'),
            isCorrect: z.boolean(),
            correctOptionId: z.string().min(1),
            explanationText: z.string().nullable(),
            explanationImageUrl: z.string().nullable(),
          }),
          z.object({
            questionType: z.literal('short_answer'),
            isCorrect: z.boolean(),
            correctAnswer: z.string().nullable(),
            explanationText: z.string().nullable(),
            explanationImageUrl: z.string().nullable(),
          }),
          z.object({
            questionType: z.literal('dialog_fill'),
            isCorrect: z.boolean(),
            blanks: z
              .array(
                z.object({
                  index: z.number().int().min(0).max(9999),
                  isCorrect: z.boolean(),
                  canonical: z.string(),
                }),
              )
              // A dialog_fill always grades ≥1 blank, so empty feedback is corrupt —
              // parity with the rehydrate validator (isValidDialogFillFeedback) and the
              // RPC guard (isDialogFillRpcResult), both of which require length > 0.
              .min(1)
              .max(50)
              .superRefine((blanks, ctx) => {
                const seen = new Set<number>()
                for (const [position, b] of blanks.entries()) {
                  if (seen.has(b.index)) {
                    ctx.addIssue({
                      code: 'custom',
                      path: [position, 'index'],
                      message: 'Duplicate blank index',
                    })
                  }
                  seen.add(b.index)
                }
              }),
            explanationText: z.string().nullable(),
            explanationImageUrl: z.string().nullable(),
          }),
          z.object({
            questionType: z.literal('ordering'),
            isCorrect: z.boolean(),
            // An ordering question always reveals ≥2 NON-EMPTY canonical item
            // texts — four-way parity with the rehydrate validator
            // (isValidFeedbackEntry), the DB-load validator (toFeedbackEntry), and
            // the RPC guard (isOrderingRpcResult), which all require non-empty strings.
            // .max(50) mirrors the sibling blanks-feedback cap (item count is DB-bounded);
            // .max(200) per-id mirrors the `order` field above (client-roundtripped draft
            // data → bound the element length so a tampered payload can't stuff arbitrarily
            // large strings into the feedback JSONB column).
            // A canonical order is a permutation — duplicate ids mean corrupt feedback.
            correctOrder: z
              .array(z.string().min(1).max(200))
              .min(2)
              .max(50)
              .refine((ids) => new Set(ids).size === ids.length, 'Ordering ids must be unique'),
            explanationText: z.string().nullable(),
            explanationImageUrl: z.string().nullable(),
          }),
        ]),
      )
      .default({}),
  })
  .superRefine((data, ctx) => {
    if (data.currentIndex >= data.questionIds.length) {
      ctx.addIssue({
        // 'custom' is the Zod v4 literal for ZodIssueCode.custom
        code: 'custom',
        path: ['currentIndex'],
        message: 'Current index out of range',
      })
    }
    const questionIdSet = new Set(data.questionIds)
    for (const key of Object.keys(data.answers)) {
      if (!questionIdSet.has(key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['answers', key],
          message: `Answer key "${key}" is not in questionIds`,
        })
      }
    }
    for (const key of Object.keys(data.feedback ?? {})) {
      if (!questionIdSet.has(key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['feedback', key],
          message: `Feedback key "${key}" is not in questionIds`,
        })
      }
    }
  })

export type SaveDraftInputParsed = z.infer<typeof SaveDraftInput>
