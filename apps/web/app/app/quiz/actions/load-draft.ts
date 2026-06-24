'use server'

import { createServerSupabaseClient } from '@repo/db/server'
import type { LoadDraftsResult } from '../types'
import { MAX_DRAFTS } from './draft-helpers'
import { rowToDraftData } from './load-draft-helpers'

export async function loadDrafts(): Promise<LoadDraftsResult> {
  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) return { drafts: [] }

    const { data, error } = await supabase
      .from('quiz_drafts')
      .select('*')
      .eq('student_id', user.id)
      .order('updated_at', { ascending: false })
      // Deliberate bound matching the insert-time cap enforced in insertNewDraft
      // (draft-helpers.ts: rejects count >= MAX_DRAFTS). Makes the read bound
      // explicit instead of relying on PostgREST's implicit max_rows truncation.
      .limit(MAX_DRAFTS)

    if (error) {
      console.error('[loadDrafts] Query error:', error.message)
      return { drafts: [] }
    }

    return { drafts: (data ?? []).map(rowToDraftData) }
  } catch (err) {
    console.error('[loadDrafts] Uncaught error:', err)
    return { drafts: [] }
  }
}
