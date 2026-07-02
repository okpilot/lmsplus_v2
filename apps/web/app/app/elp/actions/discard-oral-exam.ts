'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'
import type { ActionResult } from '@/lib/action-result'
import { rpc } from '@/lib/supabase-rpc'

const DiscardOralExamInput = z.object({ sessionId: z.uuid() })

export async function discardOralExam(raw: unknown): Promise<ActionResult> {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) return { success: false, error: 'Not authenticated' }

    let input: { sessionId: string }
    try {
      input = DiscardOralExamInput.parse(raw)
    } catch {
      return { success: false, error: 'Invalid input' }
    }

    const { data, error } = await rpc<boolean>(supabase, 'discard_oral_exam_session', {
      p_session_id: input.sessionId,
    })
    if (error || data === null) {
      console.error('[discardOralExam] RPC error:', error?.message ?? 'no data returned')
      const userMessage = (error?.message ?? '').includes('oral_session_not_found')
        ? 'Oral exam session not found.'
        : 'Failed to discard oral exam. Please try again.'
      return { success: false, error: userMessage }
    }

    return { success: true }
  } catch (err) {
    console.error('[discardOralExam] Uncaught error:', err)
    return { success: false, error: 'Something went wrong. Please try again.' }
  }
}
