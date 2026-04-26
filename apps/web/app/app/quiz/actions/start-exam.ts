'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'
import { rpc } from '@/lib/supabase-rpc'
import type { StartExamResult } from '../types'

const StartExamInput = z.object({
  subjectId: z.uuid(),
})

const StartExamRpcResultSchema = z.object({
  session_id: z.uuid(),
  question_ids: z.array(z.uuid()),
  time_limit_seconds: z.number().int().positive(),
  total_questions: z.number().int().positive(),
  pass_mark: z.number().min(0).max(100),
})

type StartExamRpcResult = z.infer<typeof StartExamRpcResultSchema>

export async function startExamSession(raw: unknown): Promise<StartExamResult> {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) return { success: false, error: 'Not authenticated' }

    let input: z.infer<typeof StartExamInput>
    try {
      input = StartExamInput.parse(raw)
    } catch {
      console.error('[startExamSession] Invalid input')
      return { success: false, error: 'Invalid input' }
    }

    const { data, error } = await rpc<StartExamRpcResult>(supabase, 'start_exam_session', {
      p_subject_id: input.subjectId,
    })

    if (error || !data) {
      const rpcMessage = error?.message ?? 'unknown RPC error'
      console.error('[startExamSession] RPC error:', rpcMessage)

      if (rpcMessage.includes('already in progress')) {
        return {
          success: false,
          error: 'A Practice Exam is already in progress for this subject.',
        }
      }
      if (rpcMessage.includes('no exam configuration')) {
        return { success: false, error: 'Practice Exam is not configured for this subject.' }
      }
      if (rpcMessage.includes('not enough active questions')) {
        return {
          success: false,
          error: 'Not enough questions available to start this Practice Exam.',
        }
      }
      return { success: false, error: 'Failed to start Practice Exam.' }
    }

    const parsed = StartExamRpcResultSchema.safeParse(data)
    if (!parsed.success) {
      console.error('[startExamSession] Invalid RPC payload')
      return { success: false, error: 'Failed to start Practice Exam.' }
    }

    return {
      success: true,
      sessionId: parsed.data.session_id,
      questionIds: parsed.data.question_ids,
      timeLimitSeconds: parsed.data.time_limit_seconds,
      passMark: parsed.data.pass_mark,
    }
  } catch (err) {
    console.error('[startExamSession] Uncaught error:', err)
    return { success: false, error: 'Something went wrong. Please try again.' }
  }
}
