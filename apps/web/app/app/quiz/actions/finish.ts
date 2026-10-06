'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'
import { rpc } from '@/lib/supabase-rpc'
import { mapProgressRpcError, SIGN_IN } from './progress-error-messages'
import type { ProgressResult } from './quiz-progress-helpers'

const FinishInput = z.object({ sessionId: z.uuid(), deviceId: z.uuid() }).strict()

const FINISH_FALLBACK = 'Could not finish the quiz. Please try again.'

/**
 * Ends the caller's own session in every mode: the RPC grades the answers already saved to
 * quiz_session_progress. A replay of a finished session returns its stored result.
 */
export async function finishQuizSession(raw: unknown): Promise<ProgressResult> {
  const parsed = FinishInput.safeParse(raw)
  if (!parsed.success) return { success: false, error: 'Invalid input' }
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: SIGN_IN }
  const { error } = await rpc<unknown>(supabase, 'finish_quiz_session', {
    p_session_id: parsed.data.sessionId,
    p_device_id: parsed.data.deviceId,
  })
  if (error) {
    console.error('[finishQuizSession] RPC error:', error.message)
    return { success: false, error: mapProgressRpcError(error.message, FINISH_FALLBACK) }
  }
  return { success: true }
}
