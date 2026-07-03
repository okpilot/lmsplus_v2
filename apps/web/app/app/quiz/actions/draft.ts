'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import type { DraftResult } from '../types'
import {
  closePracticeSessionForDraft,
  insertNewDraftForUser,
  updateExistingDraft,
} from './draft-helpers'
import { SaveDraftInput, type SaveDraftInputParsed } from './draft-schema'

export async function saveDraft(raw: unknown): Promise<DraftResult> {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) return { success: false, error: 'Not authenticated' }

    let input: SaveDraftInputParsed
    try {
      input = SaveDraftInput.parse(raw)
    } catch {
      console.error('[saveDraft] Invalid input')
      return { success: false, error: 'Invalid input' }
    }
    const result = input.draftId
      ? await updateExistingDraft(supabase, input, user.id)
      : await insertNewDraftForUser(supabase, input, user.id)

    // Parking the draft must close the underlying practice session (#1085) so it
    // stops blocking new starts. Runs after EITHER branch (insert OR update — the
    // update path is hit when re-saving a resumed draft). Best-effort by design.
    if (result.success) await closePracticeSessionForDraft(supabase, input.sessionId, user.id)
    return result
  } catch (err) {
    console.error('[saveDraft] Uncaught error:', err)
    return { success: false, error: 'Something went wrong. Please try again.' }
  }
}
