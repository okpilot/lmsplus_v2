'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'
import { rpc } from '@/lib/supabase-rpc'
import type { StartExamResult } from '../types'

const StartExamInput = z.object({
  subjectId: z.uuid(),
})

type StartExamRpcResult = {
  session_id: string
  question_ids: string[]
  time_limit_seconds: number
  total_questions: number
  pass_mark: number
}

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
        return { success: false, error: 'An exam session is already in progress for this subject.' }
      }
      if (rpcMessage.includes('no exam configuration')) {
        return { success: false, error: 'Exam mode is not configured for this subject.' }
      }
      if (rpcMessage.includes('not enough active questions')) {
        return { success: false, error: 'Not enough questions available to start this exam.' }
      }
      return { success: false, error: 'Failed to start exam session.' }
    }

    return {
      success: true,
      sessionId: data.session_id,
      questionIds: data.question_ids,
      timeLimitSeconds: data.time_limit_seconds,
      passMark: data.pass_mark,
    }
  } catch (err) {
    console.error('[startExamSession] Uncaught error:', err)
    return { success: false, error: 'Something went wrong. Please try again.' }
  }
}
