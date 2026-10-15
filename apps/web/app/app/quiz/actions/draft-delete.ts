'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import { z } from 'zod'
import { verifySessionUser } from '@/lib/auth/verify-session-user'
import { resolveZeroRowWrite } from './_caller-active'

const DeleteDraftInput = z.object({
  draftId: z.uuid(),
})

function parseDraftId(raw: unknown): string | null {
  const parsed = DeleteDraftInput.safeParse(raw)
  if (parsed.success) return parsed.data.draftId
  console.error('[deleteDraft] Invalid input')
  return null
}

// quiz_drafts uses real DELETE (not soft delete) — approved exception for temp storage
// Delete by id AND student_id to prevent one student deleting another's draft
function deleteOwnDraft(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  draftId: string,
  studentId: string,
) {
  return supabase
    .from('quiz_drafts')
    .delete()
    .eq('id', draftId)
    .eq('student_id', studentId)
    .select('id')
}

export async function deleteDraft(raw: unknown): Promise<{ success: boolean }> {
  try {
    const supabase = await createServerSupabaseClient()
    const user = await verifySessionUser(supabase)
    if (!user) return { success: false }

    const draftId = parseDraftId(raw)
    if (!draftId) return { success: false }

    const { data, error } = await deleteOwnDraft(supabase, draftId, user.id)

    if (error) {
      console.error('[deleteDraft] Delete error:', error.message)
      return { success: false }
    }
    if (data?.length) return { success: true }
    // Zero rows: already deleted, or RLS refused a deactivated caller.
    return resolveZeroRowWrite(supabase, {
      userId: user.id,
      tag: 'deleteDraft',
      whenActive: { success: true },
      whenInactive: { success: false },
    })
  } catch (err) {
    console.error('[deleteDraft] Uncaught error:', err)
    return { success: false }
  }
}
