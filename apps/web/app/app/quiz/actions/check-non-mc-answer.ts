'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import type { z } from 'zod'
import type { CheckNonMcAnswerResult } from '../types'
import {
  checkDiagramLabelAnswer,
  checkDialogFillAnswer,
  checkOrderingAnswer,
  checkShortAnswer,
} from './check-non-mc-answer-dispatch'
import { verifySessionMembership } from './check-non-mc-answer-helpers'
import { CheckNonMcAnswerSchema } from './check-non-mc-answer-schema'

export async function checkNonMcAnswer(raw: unknown): Promise<CheckNonMcAnswerResult> {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: 'Not authenticated' }

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
  const { questionId, sessionId } = parsed

  const membershipError = await verifySessionMembership(supabase, {
    sessionId,
    userId: user.id,
    questionId,
  })
  // #1190 AC3: three of verifySessionMembership's FOUR returns were silent — what made a
  // discarded-session runner undiagnosable. Logged here because that helper is at 210/200 lines
  // (§1); `membershipError` (sanitized, never a raw DB message) names which CLASS fired.
  // Caveats: two of the silent three both emit 'Session not found' (PGRST116 vs the unreachable
  // null-row floor); and the fourth already logs there, so that fault emits two lines.
  if (membershipError) {
    console.error('[checkNonMcAnswer] Membership failed:', membershipError, questionId, sessionId)
    return { success: false, error: membershipError }
  }

  if ('responseText' in parsed) return checkShortAnswer(supabase, parsed)
  if ('order' in parsed) return checkOrderingAnswer(supabase, parsed)
  if ('mapping' in parsed) return checkDiagramLabelAnswer(supabase, parsed)
  return checkDialogFillAnswer(supabase, parsed)
}
