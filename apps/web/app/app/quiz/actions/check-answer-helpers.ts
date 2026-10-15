// Two roles for the checkAnswer Server Action: the check_quiz_answer call (which reads the
// answer key) and a runtime guard on its result.
// Hoisted out of check-answer.ts for code-style.md §3 (function length), not §1. The
// non-MC path splits the same way but across two files — helpers for the ownership check,
// dispatch for the RPC calls; this merges both.
//
// This module must NOT carry 'use server', and the load-bearing reason is not that a sync
// export would forbid it — that obstacle is removable, so do not rely on it. The reason is
// that a 'use server' module publishes every async export as an endpoint, and `gradeAnswer`
// returns `correct_option_id` — the MC answer key that docs/security.md §4 and mig 111's
// column REVOKE exist to protect. Do not make it such a module. (It would not be a working
// bypass today: the injected SupabaseClient is not serializable across the boundary, and the
// RPC self-guards — see gradeAnswer's docblock. That margin is not ours to spend.)
// `CheckAnswerRpcResult` and `isCheckAnswerRpcResult` are file-private for the same reason:
// nothing here should widen the surface by accident.
import type { createServerSupabaseClient } from '@repo/db/server'
import { rpc } from '@/lib/supabase-rpc'
import type { CheckAnswerResult } from '../types'
import { mapProgressRpcError } from './progress-error-messages'

// Declared locally, as elsewhere in apps/web. Sites:
// git grep -nE '^(export )?type \w+ = Awaited<ReturnType<typeof createServerSupabaseClient>>' -- apps/web
type SupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>

/**
 * Calls check_quiz_answer and maps its result. Split from the action for the same reason
 * the non-MC path keeps its RPC calls in check-non-mc-answer-dispatch.ts: it leaves
 * checkAnswer a pure orchestrator inside §3's boundary.
 *
 * The RPC is the session guard: mig `20261002000700` (the latest check_quiz_answer) checks
 * auth.uid(), the active-user gate, session ownership, practice mode and question_ids
 * membership before the key is read, raising session_not_found / question_not_in_session
 * (mapped by mapProgressRpcError).
 */
export async function gradeAnswer(
  supabase: SupabaseClient,
  opts: {
    questionId: string
    selectedOptionId: string
    sessionId: string
    deviceId?: string
    timeSpentMs?: number
  },
): Promise<CheckAnswerResult> {
  const { data, error } = await rpc<CheckAnswerRpcResult>(supabase, 'check_quiz_answer', {
    p_question_id: opts.questionId,
    p_selected_option_id: opts.selectedOptionId,
    p_session_id: opts.sessionId,
    p_device_id: opts.deviceId ?? null,
    p_time_spent_ms: opts.timeSpentMs ?? null,
  })

  if (error || !isCheckAnswerRpcResult(data)) {
    console.error('[checkAnswer] RPC error:', error?.message)
    return { success: false, error: mapProgressRpcError(error?.message, 'Question not found') }
  }

  return {
    success: true,
    isCorrect: data.is_correct,
    correctOptionId: data.correct_option_id,
    explanationText: data.explanation_text,
    explanationImageUrl: data.explanation_image_url,
  }
}

type CheckAnswerRpcResult = {
  is_correct: boolean
  correct_option_id: string
  explanation_text: string | null
  explanation_image_url: string | null
}

function isCheckAnswerRpcResult(value: unknown): value is CheckAnswerRpcResult {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.is_correct === 'boolean' &&
    typeof v.correct_option_id === 'string' &&
    (v.explanation_text === null || typeof v.explanation_text === 'string') &&
    (v.explanation_image_url === null || typeof v.explanation_image_url === 'string')
  )
}
