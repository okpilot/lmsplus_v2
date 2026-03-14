'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { ZodError, z } from 'zod'
import type { DraftResult } from '../types'
import { insertNewDraft, updateExistingDraft } from './draft-helpers'

const SaveDraftInput = z.object({
  draftId: z.string().uuid().optional(),
  sessionId: z.string().uuid(),
  questionIds: z.array(z.string().uuid()).min(1),
  answers: z.record(
    z.string(),
    z.object({
      selectedOptionId: z.string().min(1),
      responseTimeMs: z.number().int().nonnegative(),
    }),
  ),
  currentIndex: z.number().int().nonnegative(),
  subjectName: z.string().max(100).optional(),
  subjectCode: z.string().max(10).optional(),
})

export async function saveDraft(raw: unknown): Promise<DraftResult> {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Not authenticated' }

    const input = SaveDraftInput.parse(raw)
    if (input.currentIndex >= input.questionIds.length) {
      return { success: false, error: 'Current index out of range' }
    }
    if (input.draftId) return await updateExistingDraft(supabase, input, user.id)

    const { data: u, error: userError } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', user.id)
      .single<{ organization_id: string }>()
    if (userError) {
      console.error('[saveDraft] Users query error:', userError.message)
      return { success: false, error: 'Failed to look up user' }
    }
    if (!u?.organization_id) return { success: false, error: 'User organization not found' }
    return await insertNewDraft(supabase, input, user.id, u.organization_id)
  } catch (err) {
    if (err instanceof ZodError)
      return { success: false, error: err.errors[0]?.message ?? 'Invalid input' }
    console.error('[saveDraft] Uncaught error:', err)
    return { success: false, error: 'Something went wrong. Please try again.' }
  }
}
