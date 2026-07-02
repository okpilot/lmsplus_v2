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
  type SupabaseClient,
  toClientBlanks,
  toRpcBlankAnswers,
} from './check-non-mc-answer-helpers'
import type { DiagramMappingEntry } from './diagram-validation'

export async function checkDialogFillAnswer(
  supabase: SupabaseClient,
  questionId: string,
  sessionId: string,
  blankAnswers: { index: number; text: string }[],
): Promise<CheckNonMcAnswerResult> {
  const { data, error } = await rpc<DialogFillRpcResult>(supabase, 'check_non_mc_answer', {
    p_question_id: questionId,
    p_session_id: sessionId,
    p_blank_answers: toRpcBlankAnswers(blankAnswers),
  })
  if (error || !isDialogFillRpcResult(data)) {
    console.error('[checkNonMcAnswer] dialog_fill RPC error:', error?.message)
    return { success: false, error: 'Could not check answer' }
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
  questionId: string,
  sessionId: string,
  mapping: DiagramMappingEntry[],
): Promise<CheckNonMcAnswerResult> {
  const { data, error } = await rpc<DiagramRpcResult>(supabase, 'check_non_mc_answer', {
    p_question_id: questionId,
    p_session_id: sessionId,
    p_mapping: mapping.map((m) => ({ zone_id: m.zoneId, label_id: m.labelId })),
  })
  if (error || !isDiagramRpcResult(data)) {
    console.error('[checkNonMcAnswer] diagram_label RPC error:', error?.message)
    return { success: false, error: 'Could not check answer' }
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
