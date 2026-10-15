'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'
import { getSessionUser } from '@/lib/auth/get-session-user'
import type { CheckAnswerResult } from '../types'
import { gradeAnswer } from './check-answer-helpers'
import { TimeSpentMs } from './check-non-mc-answer-schema'
import { SIGN_IN } from './progress-error-messages'

const CheckAnswerSchema = z.object({
  questionId: z.uuid(),
  selectedOptionId: z.enum(['a', 'b', 'c', 'd']),
  sessionId: z.uuid(),
  // Progress save forwarded to check_quiz_answer (p_device_id / p_time_spent_ms).
  deviceId: z.uuid().optional(),
  timeSpentMs: TimeSpentMs.optional(),
})

export async function checkAnswer(raw: unknown): Promise<CheckAnswerResult> {
  if (!(await getSessionUser())) return { success: false, error: SIGN_IN }

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

  // check_quiz_answer is the session/ownership/membership guard.
  const supabase = await createServerSupabaseClient()
  return gradeAnswer(supabase, parsed)
}
