'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import type { z } from 'zod'
import { getSessionUser } from '@/lib/auth/get-session-user'
import type { CheckNonMcAnswerResult } from '../types'
import {
  checkDiagramLabelAnswer,
  checkDialogFillAnswer,
  checkOrderingAnswer,
  checkShortAnswer,
} from './check-non-mc-answer-dispatch'
import { CheckNonMcAnswerSchema } from './check-non-mc-answer-schema'
import { SIGN_IN } from './progress-error-messages'

export async function checkNonMcAnswer(raw: unknown): Promise<CheckNonMcAnswerResult> {
  if (!(await getSessionUser())) return { success: false, error: SIGN_IN }

  let parsed: z.infer<typeof CheckNonMcAnswerSchema>
  try {
    parsed = CheckNonMcAnswerSchema.parse(raw)
  } catch {
    // Bare string, never the ZodError: the schema's four `.strict()` members echo
    // unrecognized key names verbatim, and its serialization is a library-internal detail.
    // Matches lookup.ts. (The ZodError does NOT carry the answer text — measured, not
    // assumed — so that is not the reason.)
    console.error('[checkNonMcAnswer] Invalid input')
    return { success: false, error: 'Invalid input' }
  }
  // check_non_mc_answer is the session/ownership/membership guard.
  const supabase = await createServerSupabaseClient()

  if ('responseText' in parsed) return checkShortAnswer(supabase, parsed)
  if ('order' in parsed) return checkOrderingAnswer(supabase, parsed)
  if ('mapping' in parsed) return checkDiagramLabelAnswer(supabase, parsed)
  return checkDialogFillAnswer(supabase, parsed)
}
