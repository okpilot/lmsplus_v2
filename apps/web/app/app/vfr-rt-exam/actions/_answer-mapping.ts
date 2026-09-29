import { z } from 'zod'

// External (camelCase) answer entry shapes. `.strict()` makes the union
// unambiguous: each shape has a distinct key set (MC, short, dialog, ordering, diagram).
// The RPC (mig 100/113, 20260929000400) reads snake_case keys — see toRpcAnswer.

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

// Ordering: one entry per slot — selectedOptionId is the item id placed in slot blankIndex.
const OrderingAnswer = z
  .object({
    questionId: z.uuid(),
    selectedOptionId: z.string().min(1).max(200),
    blankIndex: z.number().int().nonnegative(),
    responseTimeMs: z.number().int().nonnegative().optional(),
  })
  .strict()

// Diagram label: one entry per placement — label selectedOptionId placed on zone responseText;
// blankIndex is distinct per entry (duplicate key only; the RPC stores the zone ordinal).
const DiagramAnswer = z
  .object({
    questionId: z.uuid(),
    selectedOptionId: z.string().min(1).max(200),
    responseText: z.string().min(1).max(200),
    blankIndex: z.number().int().nonnegative(),
    responseTimeMs: z.number().int().nonnegative().optional(),
  })
  .strict()

export const AnswerEntry = z.union([
  McAnswer,
  ShortAnswer,
  DialogAnswer,
  OrderingAnswer,
  DiagramAnswer,
])

type AnswerEntryInput = z.infer<typeof AnswerEntry>

/**
 * Map one external camelCase answer entry to the snake_case shape the
 * submit_vfr_rt_exam_answers RPC reads, field by field. MC uses `selected_option_id` (NOT
 * batch-submit's `selected_option` — the VFR RT RPC reads
 * `v_answer->>'selected_option_id'` per mig 113).
 */
export function toRpcAnswer(a: AnswerEntryInput): Record<string, unknown> {
  const out: Record<string, unknown> = {
    question_id: a.questionId,
    response_time_ms: a.responseTimeMs ?? 0,
  }
  if ('selectedOptionId' in a) out.selected_option_id = a.selectedOptionId
  if ('blankIndex' in a) out.blank_index = a.blankIndex
  if ('responseText' in a) out.response_text = a.responseText
  return out
}
