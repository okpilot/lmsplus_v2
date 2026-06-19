'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'
import { rpc } from '@/lib/supabase-rpc'
import { AnswerEntry, toRpcAnswer } from './_answer-mapping'

const SubmitVfrRtExamInput = z.object({
  sessionId: z.uuid(),
  answers: z.array(AnswerEntry).min(1),
})

// The RPC RETURNS a jsonb object. This action consumes only `expired` from it
// (session_id comes from the validated input, the trusted source), so the guard
// validates object-ness + that field rather than the per-part numerics we never
// read — over-constraining those would risk a false-negative on NUMERIC-as-string
// serialization (code-style.md §5). `expired` is set only on the timer-expiry path.
const SubmitRpcResultSchema = z.object({ expired: z.boolean().optional() })

export type SubmitVfrRtExamResult =
  | { success: true; session_id: string; redirect_to: string; expired?: boolean }
  | { success: false; error: string }

export async function submitVfrRtExam(raw: unknown): Promise<SubmitVfrRtExamResult> {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) return { success: false, error: 'Not authenticated' }

    const parsed = SubmitVfrRtExamInput.safeParse(raw)
    if (!parsed.success) {
      console.error('[submitVfrRtExam] Invalid input')
      return { success: false, error: 'Invalid input' }
    }

    const p_answers = parsed.data.answers.map(toRpcAnswer)
    const { data, error } = await rpc<unknown>(supabase, 'submit_vfr_rt_exam_answers', {
      p_session_id: parsed.data.sessionId,
      p_answers,
    })

    if (error) {
      console.error('[submitVfrRtExam] RPC error:', error.message)
      return { success: false, error: 'Failed to submit exam' }
    }

    // RETURNS jsonb (scalar or single-row array) — unwrap + validate before use,
    // mirroring start.ts (code-style.md §5).
    const row: unknown = Array.isArray(data) ? data[0] : data
    const result = SubmitRpcResultSchema.safeParse(row)
    if (!result.success) {
      console.error('[submitVfrRtExam] Invalid RPC response shape')
      return { success: false, error: 'Failed to submit exam' }
    }

    return {
      success: true,
      session_id: parsed.data.sessionId,
      redirect_to: `/app/vfr-rt-exam/results/${parsed.data.sessionId}`,
      // Surface timer-expiry so Phase C can show a "time's up" confirmation
      // without a separate DB read; absent on the normal grade path.
      ...(result.data.expired ? { expired: true } : {}),
    }
  } catch (err) {
    console.error('[submitVfrRtExam] Uncaught error:', err)
    return { success: false, error: 'Something went wrong. Please try again.' }
  }
}
