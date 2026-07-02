'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'
import { rpc } from '@/lib/supabase-rpc'
import type { BatchRpcResult, BatchSubmitResult } from '../types'

const BatchSubmitInput = z.object({
  sessionId: z.uuid(),
  answers: z
    .array(
      z.object({
        questionId: z.uuid(),
        // .min(1): for ordering fan-out this carries the item id passed to
        // _grade_record_ordering(p_item_id); for diagram_label fan-out it carries
        // the placed label id passed to _grade_record_diagram_label(p_label_id,
        // mig 155) — an empty string would pass Zod and throw inside the RPC
        // instead of failing cleanly here (parity with the OrderingInput element
        // .min(1) in check-non-mc-answer-schema.ts).
        selectedOptionId: z.string().min(1).optional(),
        // diagram_label fan-out repurposes this field to carry the target zone id
        // (mig 155 header note) — same generic entry shape as short_answer's free
        // text, no separate field needed. .trim().min(1) shares selectedOptionId's
        // reject-empty intent (with an added .trim(), since responseText can carry
        // free short_answer text): an empty/whitespace zone id (or short_answer
        // text) would otherwise pass Zod and throw/mis-grade inside the RPC instead
        // of failing cleanly here.
        responseText: z.string().trim().min(1).optional(),
        // Required by dialog_fill (blank slot) / ordering (sequence slot) /
        // diagram_label (dedup index only — discarded server-side, mig 155) fan-out.
        blankIndex: z.number().int().nonnegative().optional(),
        responseTimeMs: z.number().int().positive(),
      }),
    )
    .min(1),
})

export async function batchSubmitQuiz(raw: unknown): Promise<BatchSubmitResult> {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) return { success: false, error: 'Not authenticated' }

    let input: z.infer<typeof BatchSubmitInput>
    try {
      input = BatchSubmitInput.parse(raw)
    } catch {
      console.error('[batchSubmitQuiz] Invalid input')
      return { success: false, error: 'Invalid input' }
    }

    const p_answers = input.answers.map((a) => ({
      question_id: a.questionId,
      selected_option: a.selectedOptionId,
      response_text: a.responseText,
      blank_index: a.blankIndex,
      response_time_ms: a.responseTimeMs,
    }))

    const { data, error } = await rpc<BatchRpcResult>(supabase, 'batch_submit_quiz', {
      p_session_id: input.sessionId,
      p_answers: p_answers,
    })

    if (error || !data) {
      const rpcMessage = error?.message ?? 'unknown RPC error'
      console.error('[batchSubmitQuiz] RPC error:', rpcMessage)
      const userMessage = rpcMessage.includes('session not found or not accessible')
        ? 'This session could not be found.'
        : 'Failed to submit quiz. Please try again.'
      return { success: false, error: userMessage }
    }

    const results = data.results.map((r) => ({
      questionId: r.question_id,
      isCorrect: r.is_correct,
      correctOptionId: r.correct_option_id,
      explanationText: r.explanation_text,
      explanationImageUrl: r.explanation_image_url,
    }))

    return {
      success: true,
      totalQuestions: data.total_questions,
      answeredCount: data.answered_count,
      correctCount: data.correct_count,
      scorePercentage: data.score_percentage,
      results,
      passed: data.passed ?? null,
      expired: data.expired ?? false,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[batchSubmitQuiz] Uncaught error:', message)
    return { success: false, error: 'Something went wrong. Please try again.' }
  }
}
