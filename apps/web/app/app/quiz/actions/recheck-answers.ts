'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import type { AnswerFeedback } from '../types'
import { SIGN_IN } from './progress-error-messages'
import { gradeBatch, readSessionQuestionIds } from './recheck-answers-helpers'
import { RecheckEnvelopeSchema } from './recheck-answers-schema'

type RecheckResult =
  | { success: true; feedback: Record<string, AnswerFeedback>; done: boolean }
  | { success: false; error: string }

/**
 * Grades a batch of restored practice answers so the navigator can colour them on open. The
 * check RPCs refuse every non-practice session, so no exam key leaves here.
 */
export async function recheckRestoredAnswers(raw: unknown): Promise<RecheckResult> {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: SIGN_IN }

  const parsed = RecheckEnvelopeSchema.safeParse(raw)
  if (!parsed.success) {
    console.error('[recheckRestoredAnswers] Invalid input')
    return { success: false, error: 'Invalid input' }
  }
  const { sessionId, deviceId, answers } = parsed.data

  const allowed = await readSessionQuestionIds(supabase, { sessionId, userId: user.id })
  if (allowed === null) return { success: true, feedback: {}, done: true }
  if (!(allowed instanceof Set)) return { success: false, error: allowed.error }

  const { feedback, fatal, done } = await gradeBatch(supabase, {
    raw: answers,
    allowed,
    sessionId,
    deviceId,
  })
  return fatal ? { success: false, error: fatal } : { success: true, feedback, done }
}
