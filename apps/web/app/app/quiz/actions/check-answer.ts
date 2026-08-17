'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'
import type { CheckAnswerResult } from '../types'
import { gradeAnswer, verifySessionMembership } from './check-answer-helpers'

const CheckAnswerSchema = z.object({
  questionId: z.uuid(),
  selectedOptionId: z.string().trim().min(1),
  sessionId: z.uuid(),
})

export async function checkAnswer(raw: unknown): Promise<CheckAnswerResult> {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: 'Not authenticated' }

  let parsed: z.infer<typeof CheckAnswerSchema>
  try {
    parsed = CheckAnswerSchema.parse(raw)
  } catch {
    // Bare string, no ZodError: its serialization is a library-internal detail a zod major
    // bump or a custom error map can change. Matches lookup.ts / submit.ts. (This schema is
    // NOT `.strict()`, so unrecognized keys are stripped, not echoed — unlike the non-MC one.)
    console.error('[checkAnswer] Invalid input')
    return { success: false, error: 'Invalid input' }
  }
  const { questionId, selectedOptionId, sessionId } = parsed

  // Verify session belongs to this user, is active, and contains the question.
  const membershipError = await verifySessionMembership(supabase, {
    sessionId,
    userId: user.id,
    questionId,
  })
  if (membershipError) return { success: false, error: membershipError }

  return gradeAnswer(supabase, { questionId, selectedOptionId, sessionId })
}
