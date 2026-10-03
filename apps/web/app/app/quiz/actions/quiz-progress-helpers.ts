// Helpers for the quiz-progress Server Actions. No 'use server' — internal to quiz-progress.ts.
import { toRpcBlankAnswers } from './check-non-mc-answer-helpers'
import { mapProgressRpcError } from './progress-error-messages'
import type { ProgressAnswerInput } from './quiz-progress-schema'

export type ProgressResult = { success: true } | { success: false; error: string }

/** snake_case jsonb shape _validate_progress_answer (mig 20261002000300) accepts, per question type. */
export function toAnswerJson(answer: ProgressAnswerInput): Record<string, unknown> {
  if ('selectedOptionId' in answer) return { selected_option_id: answer.selectedOptionId }
  if ('responseText' in answer) return { response_text: answer.responseText }
  if ('blankAnswers' in answer) return { blanks: toRpcBlankAnswers(answer.blankAnswers) }
  if ('order' in answer) return { order: answer.order }
  return { mapping: answer.mapping.map((m) => ({ zone_id: m.zoneId, label_id: m.labelId })) }
}

/** Logs the raw RPC error server-side; returns only mapped copy (or a generic fallback) to the caller. */
export function toProgressResult(error: { message: string } | null, label: string): ProgressResult {
  if (!error) return { success: true }
  console.error(`[${label}] RPC error:`, error.message)
  return { success: false, error: mapProgressRpcError(error.message, 'Could not save progress') }
}
