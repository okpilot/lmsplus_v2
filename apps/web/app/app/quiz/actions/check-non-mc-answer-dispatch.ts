// Per-branch RPC dispatch handlers for checkNonMcAnswer, hoisted out of the
// Server Action file to keep it under the 100-line cap (code-style.md §1) —
// the check_non_mc_answer signature grew a 4th (diagram_label) branch on top
// of an already-at-cap file. No 'use server' pragma — these are internal
// helpers called only from check-non-mc-answer.ts, mirroring the existing
// schema/helpers split in this feature folder.
import { rpc } from '@/lib/supabase-rpc'
import type { CheckNonMcAnswerResult } from '../types'
import {
  type DiagramRpcResult,
  type DialogFillRpcResult,
  isDiagramRpcResult,
  isDialogFillRpcResult,
  isOrderingRpcResult,
  isShortAnswerRpcResult,
  type OrderingRpcResult,
  type ShortAnswerRpcResult,
  type SupabaseClient,
  toClientBlanks,
  toRpcBlankAnswers,
} from './check-non-mc-answer-helpers'
import type {
  DiagramCheckInput,
  DialogFillCheckInput,
  OrderingCheckInput,
  ShortAnswerCheckInput,
} from './check-non-mc-answer-schema'
import { mapProgressRpcError } from './progress-error-messages'

const CHECK_FAILED = 'Could not check answer'

// Args common to every branch; p_device_id / p_time_spent_ms drive the in-RPC progress save.
function baseArgs(input: {
  questionId: string
  sessionId: string
  deviceId?: string
  timeSpentMs?: number
}) {
  return {
    p_question_id: input.questionId,
    p_session_id: input.sessionId,
    p_device_id: input.deviceId ?? null,
    p_time_spent_ms: input.timeSpentMs ?? null,
  }
}

export async function checkShortAnswer(
  supabase: SupabaseClient,
  input: ShortAnswerCheckInput,
): Promise<CheckNonMcAnswerResult> {
  const { data, error } = await rpc<ShortAnswerRpcResult>(supabase, 'check_non_mc_answer', {
    ...baseArgs(input),
    p_response_text: input.responseText,
  })
  if (error || !isShortAnswerRpcResult(data)) {
    console.error('[checkNonMcAnswer] short_answer RPC error:', error?.message)
    return { success: false, error: mapProgressRpcError(error?.message, CHECK_FAILED) }
  }
  return {
    success: true,
    questionType: 'short_answer',
    isCorrect: data.is_correct,
    correctAnswer: data.correct_answer,
    explanationText: data.explanation_text,
    explanationImageUrl: data.explanation_image_url,
  }
}

export async function checkOrderingAnswer(
  supabase: SupabaseClient,
  input: OrderingCheckInput,
): Promise<CheckNonMcAnswerResult> {
  const { data, error } = await rpc<OrderingRpcResult>(supabase, 'check_non_mc_answer', {
    ...baseArgs(input),
    p_order: input.order,
  })
  if (error || !isOrderingRpcResult(data)) {
    console.error('[checkNonMcAnswer] ordering RPC error:', error?.message)
    return { success: false, error: mapProgressRpcError(error?.message, CHECK_FAILED) }
  }
  return {
    success: true,
    questionType: 'ordering',
    isCorrect: data.is_correct,
    correctOrder: data.correct_order,
    explanationText: data.explanation_text,
    explanationImageUrl: data.explanation_image_url,
  }
}

export async function checkDialogFillAnswer(
  supabase: SupabaseClient,
  input: DialogFillCheckInput,
): Promise<CheckNonMcAnswerResult> {
  const { data, error } = await rpc<DialogFillRpcResult>(supabase, 'check_non_mc_answer', {
    ...baseArgs(input),
    p_blank_answers: toRpcBlankAnswers(input.blankAnswers),
  })
  if (error || !isDialogFillRpcResult(data)) {
    console.error('[checkNonMcAnswer] dialog_fill RPC error:', error?.message)
    return { success: false, error: mapProgressRpcError(error?.message, CHECK_FAILED) }
  }
  return {
    success: true,
    questionType: 'dialog_fill',
    isCorrect: data.is_correct,
    blanks: toClientBlanks(data.blanks),
    explanationText: data.explanation_text,
    explanationImageUrl: data.explanation_image_url,
  }
}

export async function checkDiagramLabelAnswer(
  supabase: SupabaseClient,
  input: DiagramCheckInput,
): Promise<CheckNonMcAnswerResult> {
  const { data, error } = await rpc<DiagramRpcResult>(supabase, 'check_non_mc_answer', {
    ...baseArgs(input),
    p_mapping: input.mapping.map((m) => ({ zone_id: m.zoneId, label_id: m.labelId })),
  })
  if (error || !isDiagramRpcResult(data)) {
    console.error('[checkNonMcAnswer] diagram_label RPC error:', error?.message)
    return { success: false, error: mapProgressRpcError(error?.message, CHECK_FAILED) }
  }
  return {
    success: true,
    questionType: 'diagram_label',
    isCorrect: data.is_correct,
    correctMapping: data.correct_mapping.map((m) => ({ zoneId: m.zone_id, labelId: m.label_id })),
    explanationText: data.explanation_text,
    explanationImageUrl: data.explanation_image_url,
  }
}
