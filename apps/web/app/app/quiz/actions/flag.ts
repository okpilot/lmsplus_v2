'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'

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

  // RLS SELECT filters deleted_at IS NULL, so this only finds active flags
  const { data: existing, error: lookupError } = await supabase
    .from('flagged_questions')
    .select('student_id')
    .eq('student_id', user.id)
    .eq('question_id', questionId)
    .maybeSingle()

  if (lookupError) {
    console.error('[toggleFlag] Lookup error:', lookupError.message)
    return { success: false, error: 'Failed to toggle flag' }
  }

  return existing
    ? unflagQuestion(supabase, user.id, questionId)
    : flagQuestion(supabase, user.id, questionId)
}

async function unflagQuestion(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  userId: string,
  questionId: string,
): Promise<FlagResult> {
  // Atomic: only matches active (non-deleted) flags, safe against concurrent toggle
  const { data, error } = await supabase
    .from('flagged_questions')
    .update({ deleted_at: new Date().toISOString() })
    .eq('student_id', userId)
    .eq('question_id', questionId)
    .is('deleted_at', null)
    .select('student_id')
  if (error) {
    console.error('[toggleFlag] Unflag error:', error.message)
    return { success: false, error: 'Failed to unflag' }
  }
  // Zero rows = already unflagged concurrently; still correct terminal state
  if (!data?.length) return { success: true, flagged: false }
  return { success: true, flagged: false }
}

async function flagQuestion(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  userId: string,
  questionId: string,
): Promise<FlagResult> {
  const { error } = await supabase.from('flagged_questions').upsert(
    {
      student_id: userId,
      question_id: questionId,
      flagged_at: new Date().toISOString(),
      deleted_at: null,
    },
    { onConflict: 'student_id,question_id' },
  )
  if (error) {
    console.error('[toggleFlag] Flag error:', error.message)
    return { success: false, error: 'Failed to flag' }
  }
  return { success: true, flagged: true }
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

  // RLS automatically filters deleted_at IS NULL
  const { data, error } = await supabase
    .from('flagged_questions')
    .select('question_id')
    .eq('student_id', user.id)
    .in('question_id', parsed.questionIds)

  if (error) {
    console.error('[getFlaggedIds] Query error:', error.message)
    return { success: false, error: 'Failed to fetch flags' }
  }

  const flaggedIds = data.map((r) => r.question_id)
  return { success: true, flaggedIds }
}
