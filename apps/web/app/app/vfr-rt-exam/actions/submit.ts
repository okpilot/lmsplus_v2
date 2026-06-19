'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'
import { rpc } from '@/lib/supabase-rpc'
import { AnswerEntry, toRpcAnswer } from './_answer-mapping'

const SubmitVfrRtExamInput = z.object({
  sessionId: z.uuid(),
  answers: z.array(AnswerEntry).min(1),
})

type SubmitRpcResult = {
  session_id: string
  part1_pct: number
  part2_pct: number
  part3_pct: number
  passed_overall: boolean
  correct_count: number
  total_questions: number
}

export type SubmitVfrRtExamResult =
  | { success: true; session_id: string; redirect_to: string }
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
    const { error } = await rpc<SubmitRpcResult>(supabase, 'submit_vfr_rt_exam_answers', {
      p_session_id: parsed.data.sessionId,
      p_answers,
    })

    if (error) {
      console.error('[submitVfrRtExam] RPC error:', error.message)
      return { success: false, error: 'Failed to submit exam' }
    }

    return {
      success: true,
      session_id: parsed.data.sessionId,
      redirect_to: `/app/vfr-rt-exam/results/${parsed.data.sessionId}`,
    }
  } catch (err) {
    console.error('[submitVfrRtExam] Uncaught error:', err)
    return { success: false, error: 'Something went wrong. Please try again.' }
  }
}
