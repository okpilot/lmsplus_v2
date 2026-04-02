'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'

const DeleteDraftInput = z.object({
  draftId: z.uuid(),
})

export async function deleteDraft(raw: unknown): Promise<{ success: boolean }> {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) return { success: false }

    let draftId: string
    try {
      ;({ draftId } = DeleteDraftInput.parse(raw))
    } catch {
      return { success: false }
    }

    // quiz_drafts uses real DELETE (not soft delete) — approved exception for temp storage
    // Delete by id AND student_id to prevent one student deleting another's draft
    const { error } = await supabase
      .from('quiz_drafts')
      .delete()
      .eq('id', draftId)
      .eq('student_id', user.id)

    if (error) {
      console.error('[deleteDraft] Delete error:', error.message)
      return { success: false }
    }
    return { success: true }
  } catch (err) {
    console.error('[deleteDraft] Uncaught error:', err)
    return { success: false }
  }
}
