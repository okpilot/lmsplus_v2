import { createServerSupabaseClient } from '@repo/db/server'
import type { AnswerFeedback } from '@/app/app/quiz/types'
import { rpc } from '@/lib/supabase-rpc'
import { withTimeout } from '@/lib/utils/with-timeout'
import { toClientFeedback } from './restored-feedback-map'

type RestoredFeedback = Record<string, AnswerFeedback>

function isFeedbackPayload(v: unknown): v is { feedback: unknown[] } {
  return (
    typeof v === 'object' && v !== null && Array.isArray((v as { feedback?: unknown }).feedback)
  )
}

function questionIdOf(element: unknown): string | null {
  const id = (element as { question_id?: unknown } | null)?.question_id
  return typeof id === 'string' ? id : null
}

/**
 * Feedback of every answer saved in an open practice session, from one read-only RPC.
 * A failure or a malformed element degrades to no feedback for it: the feedback is cosmetic.
 */
export async function getRestoredFeedback(sessionId: string): Promise<RestoredFeedback> {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await rpc<unknown>(supabase, 'get_restored_feedback', {
    p_session_id: sessionId,
  })
  if (error) {
    console.error('[getRestoredFeedback] RPC error:', error.message)
    return {}
  }
  if (!isFeedbackPayload(data)) {
    console.error('[getRestoredFeedback] Unexpected payload shape')
    return {}
  }
  const out: RestoredFeedback = {}
  let dropped = 0
  for (const element of data.feedback) {
    const id = questionIdOf(element)
    const mapped = id === null ? null : toClientFeedback(element)
    if (id === null || mapped === null) dropped += 1
    else out[id] = mapped
  }
  if (dropped > 0) console.error('[getRestoredFeedback] Dropped malformed elements:', dropped)
  return out
}

const RESTORED_FEEDBACK_TIMEOUT_MS = 3000
const TIMED_OUT = {} as RestoredFeedback

/** Never rejects: degrades to no feedback on failure or after RESTORED_FEEDBACK_TIMEOUT_MS. */
export async function getRestoredFeedbackBounded(sessionId: string): Promise<RestoredFeedback> {
  const result = await withTimeout(
    getRestoredFeedback(sessionId).catch((e: unknown) => {
      console.error(
        '[getRestoredFeedback] read failed:',
        e instanceof Error ? e.message : String(e),
      )
      return {} as RestoredFeedback
    }),
    RESTORED_FEEDBACK_TIMEOUT_MS,
    TIMED_OUT,
  )
  if (result !== TIMED_OUT) return result
  console.error(`[getRestoredFeedback] timed out after ${RESTORED_FEEDBACK_TIMEOUT_MS}ms`)
  return {}
}
