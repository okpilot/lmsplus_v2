import { z } from 'zod'

// External (camelCase) answer entry shapes. `.strict()` makes the union
// unambiguous: dialog's extra blankIndex disqualifies it from short and
// vice-versa. The RPC (mig 100/113) reads snake_case keys — see toRpcAnswer.

const McAnswer = z
  .object({
    questionId: z.uuid(),
    selectedOptionId: z.enum(['a', 'b', 'c', 'd']),
    responseTimeMs: z.number().int().nonnegative().optional(),
  })
  .strict()

const ShortAnswer = z
  .object({
    questionId: z.uuid(),
    responseText: z.string(),
    responseTimeMs: z.number().int().nonnegative().optional(),
  })
  .strict()

const DialogAnswer = z
  .object({
    questionId: z.uuid(),
    blankIndex: z.number().int().nonnegative(),
    responseText: z.string(),
    responseTimeMs: z.number().int().nonnegative().optional(),
  })
  .strict()

export const AnswerEntry = z.union([McAnswer, ShortAnswer, DialogAnswer])

type AnswerEntryInput = z.infer<typeof AnswerEntry>

/**
 * Map one external camelCase answer entry to the snake_case shape the
 * submit_vfr_rt_exam_answers RPC reads. MC uses `selected_option_id` (NOT
 * batch-submit's `selected_option` — the VFR RT RPC reads
 * `v_answer->>'selected_option_id'` per mig 113).
 */
export function toRpcAnswer(a: AnswerEntryInput): Record<string, unknown> {
  const responseTimeMs = a.responseTimeMs ?? 0
  if ('selectedOptionId' in a) {
    return {
      question_id: a.questionId,
      selected_option_id: a.selectedOptionId,
      response_time_ms: responseTimeMs,
    }
  }
  if ('blankIndex' in a) {
    return {
      question_id: a.questionId,
      blank_index: a.blankIndex,
      response_text: a.responseText,
      response_time_ms: responseTimeMs,
    }
  }
  return {
    question_id: a.questionId,
    response_text: a.responseText,
    response_time_ms: responseTimeMs,
  }
}
