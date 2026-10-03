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
import { mapMembershipError, SIGN_IN } from './progress-error-messages'

export async function checkNonMcAnswer(raw: unknown): Promise<CheckNonMcAnswerResult> {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: SIGN_IN }

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

  const membership = mapMembershipError(
    await verifySessionMembership(supabase, { sessionId, userId: user.id, questionId }),
  )
  if (membership) {
    // #1190 AC3: names which membership failure class fired; the message is sanitized, never a raw DB one.
    console.error('[checkNonMcAnswer] Membership failed:', membership.error, questionId, sessionId)
    return membership
  }

  if ('responseText' in parsed) return checkShortAnswer(supabase, parsed)
  if ('order' in parsed) return checkOrderingAnswer(supabase, parsed)
  if ('mapping' in parsed) return checkDiagramLabelAnswer(supabase, parsed)
  return checkDialogFillAnswer(supabase, parsed)
}
