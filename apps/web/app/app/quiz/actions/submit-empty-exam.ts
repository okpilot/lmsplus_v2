'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'
import { rpc } from '@/lib/supabase-rpc'
import type { CompleteEmptyExamResult } from '../types'

const SubmitEmptyExamInput = z.object({
  sessionId: z.uuid(),
})

type CompleteEmptyExamRpcResult = {
  session_id: string
  score_percentage: number
  passed: boolean
  total_questions: number
  answered_count: number
}

export async function submitEmptyExamSession(raw: unknown): Promise<CompleteEmptyExamResult> {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) return { success: false, error: 'Not authenticated' }

    let input: z.infer<typeof SubmitEmptyExamInput>
    try {
      input = SubmitEmptyExamInput.parse(raw)
    } catch {
      console.error('[submitEmptyExamSession] Invalid input')
      return { success: false, error: 'Invalid input' }
    }

    const { data, error } = await rpc<CompleteEmptyExamRpcResult>(
      supabase,
      'complete_empty_exam_session',
      { p_session_id: input.sessionId },
    )

    if (error || !data) {
      const rpcMessage = error?.message ?? 'unknown RPC error'
      console.error('[submitEmptyExamSession] RPC error:', rpcMessage)

      if (rpcMessage.includes('session is not a mock exam')) {
        return { success: false, error: 'Session is not a Practice Exam.' }
      }
      if (rpcMessage.includes('session not found')) {
        return { success: false, error: 'Session not found.' }
      }
      return { success: false, error: 'Failed to complete Practice Exam.' }
    }

    return { success: true, sessionId: input.sessionId }
  } catch (err) {
    console.error('[submitEmptyExamSession] Uncaught error:', err)
    return { success: false, error: 'Something went wrong. Please try again.' }
  }
}
