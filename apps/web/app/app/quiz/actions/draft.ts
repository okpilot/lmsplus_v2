'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import type { DraftResult } from '../types'
import { insertNewDraft, updateExistingDraft } from './draft-helpers'
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
    console.error('[saveDraft] Uncaught error:', err)
    return { success: false, error: 'Something went wrong. Please try again.' }
  }
}
