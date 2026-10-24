// Per-branch RPC dispatch handlers for checkNonMcAnswer, hoisted out of the
// Server Action file — the check_non_mc_answer signature grew a 4th (diagram_label) branch.
// No 'use server' pragma — these are internal
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
  toRpcBlankAnswers,
} from './check-non-mc-answer-helpers'
import type {
  DiagramCheckInput,
  DialogFillCheckInput,
  OrderingCheckInput,
  ShortAnswerCheckInput,
} from './check-non-mc-answer-schema'
import {
  toDiagramFeedback,
  toDialogFeedback,
  toOrderingFeedback,
  toShortFeedback,
} from './non-mc-feedback-map'
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
    console.error('[checkNonMcAnswer] short_answer RPC error:', error?.message, {
      questionId: input.questionId,
      sessionId: input.sessionId,
    })
    return { success: false, error: mapProgressRpcError(error?.message, CHECK_FAILED) }
  }
  return { success: true, ...toShortFeedback(data) }
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
    console.error('[checkNonMcAnswer] ordering RPC error:', error?.message, {
      questionId: input.questionId,
      sessionId: input.sessionId,
    })
    return { success: false, error: mapProgressRpcError(error?.message, CHECK_FAILED) }
  }
  return { success: true, ...toOrderingFeedback(data) }
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
    console.error('[checkNonMcAnswer] dialog_fill RPC error:', error?.message, {
      questionId: input.questionId,
      sessionId: input.sessionId,
    })
    return { success: false, error: mapProgressRpcError(error?.message, CHECK_FAILED) }
  }
  return { success: true, ...toDialogFeedback(data) }
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
    console.error('[checkNonMcAnswer] diagram_label RPC error:', error?.message, {
      questionId: input.questionId,
      sessionId: input.sessionId,
    })
    return { success: false, error: mapProgressRpcError(error?.message, CHECK_FAILED) }
  }
  return { success: true, ...toDiagramFeedback(data) }
}
