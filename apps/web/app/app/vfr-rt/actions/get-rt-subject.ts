'use server'

import { createServerSupabaseClient } from '@repo/db/server'

export type RtSubjectData = {
  id: string
}

/**
 * Loads the RT subject id. Topics now load client-side via the reused quiz
 * topic-tree hook (useLockedSubjectLoad), so this no longer fetches parts.
 * Throws on subject-lookup failure (page-critical).
 */
export async function getRtSubjectData(): Promise<RtSubjectData> {
  const supabase = await createServerSupabaseClient()

  // easa_subjects has no deleted_at column (defined in mig 001, no soft-delete) — read-scope is enforced by RLS.
  const { data: subject, error } = await supabase
    .from('easa_subjects')
    .select('id')
    .eq('code', 'RT')
    .single()

  if (error || !subject) {
    // Log the raw DB error server-side; throw a generic message (code-style §5 —
    // never embed Postgres error strings, which can leak schema/connection detail).
    console.error('[getRtSubjectData] Subject lookup failed:', error?.message ?? 'not found')
    throw new Error('Failed to load VFR RT subject')
  }

  return { id: subject.id }
}
