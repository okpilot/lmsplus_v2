'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'
import { verifySessionUser } from '@/lib/auth/verify-session-user'
import { getFlaggedQuestionIds } from '@/lib/queries/flagged-questions'
import { findActiveInternalExamSession, lookupAndToggleFlag } from './_flag-guard'

const ToggleFlagSchema = z.object({ questionId: z.uuid() })
const GetFlaggedIdsSchema = z.object({ questionIds: z.array(z.uuid()) })

type FlagResult = { success: true; flagged: boolean } | { success: false; error: string }
type GetFlaggedResult = { success: true; flaggedIds: string[] } | { success: false; error: string }

export async function toggleFlag(raw: unknown): Promise<FlagResult> {
  const supabase = await createServerSupabaseClient()
  const user = await verifySessionUser(supabase)
  if (!user) return { success: false, error: 'Not authenticated' }

  let parsed: z.infer<typeof ToggleFlagSchema>
  try {
    parsed = ToggleFlagSchema.parse(raw)
  } catch {
    return { success: false, error: 'Invalid input' }
  }
  const { questionId } = parsed

  const examGuard = await findActiveInternalExamSession(supabase, user.id)
  if (examGuard.dbError) {
    return { success: false, error: 'Failed to toggle flag' }
  }
  if (examGuard.active) {
    console.error('[toggleFlag] Rejected flag during active internal_exam for user', user.id)
    return { success: false, error: 'cannot_flag_internal_exam' }
  }

  return lookupAndToggleFlag(supabase, user.id, questionId)
}

export async function getFlaggedIds(raw: unknown): Promise<GetFlaggedResult> {
  const supabase = await createServerSupabaseClient()
  const user = await verifySessionUser(supabase)
  if (!user) return { success: true, flaggedIds: [] }

  let parsed: z.infer<typeof GetFlaggedIdsSchema>
  try {
    parsed = GetFlaggedIdsSchema.parse(raw)
  } catch {
    return { success: false, error: 'Invalid input' }
  }

  return { success: true, flaggedIds: await getFlaggedQuestionIds(parsed.questionIds) }
}
