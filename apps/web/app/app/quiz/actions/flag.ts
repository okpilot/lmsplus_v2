'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'
import { findActiveInternalExamSession, lookupAndToggleFlag } from './_flag-guard'

const ToggleFlagSchema = z.object({ questionId: z.uuid() })
const GetFlaggedIdsSchema = z.object({ questionIds: z.array(z.uuid()) })

type FlagResult = { success: true; flagged: boolean } | { success: false; error: string }
type GetFlaggedResult = { success: true; flaggedIds: string[] } | { success: false; error: string }

export async function toggleFlag(raw: unknown): Promise<FlagResult> {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: 'Not authenticated' }

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
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return { success: true, flaggedIds: [] }

  let parsed: z.infer<typeof GetFlaggedIdsSchema>
  try {
    parsed = GetFlaggedIdsSchema.parse(raw)
  } catch {
    return { success: false, error: 'Invalid input' }
  }

  const { data, error } = await supabase
    .from('active_flagged_questions')
    .select('question_id')
    .eq('student_id', user.id)
    .in('question_id', parsed.questionIds)

  if (error) {
    console.error('[getFlaggedIds] Query error:', error.message)
    return { success: false, error: 'Failed to fetch flags' }
  }

  // View columns typed nullable (Postgres artifact); safe to cast — underlying table has NOT NULL constraints.
  const flaggedIds = data.map((r) => r.question_id as string)
  return { success: true, flaggedIds }
}
