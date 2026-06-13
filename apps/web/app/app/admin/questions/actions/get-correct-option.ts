'use server'

import { requireAdmin } from '@/lib/auth/require-admin'

export type GetCorrectOptionResult = { correctOptionId: string | null }

/**
 * Reads the REVOKE-gated MC answer key for a single question via the
 * SECURITY DEFINER get_question_authoring_fields() RPC (#823). A direct
 * PostgREST SELECT on questions.correct_option_id raises 42501 for the
 * `authenticated` role by design — this RPC is the only authenticated read
 * path. The admin edit dialog calls this when opening an existing question so
 * the "correct" radio can be pre-seeded.
 */
export async function getCorrectOption(p_question_id: unknown): Promise<GetCorrectOptionResult> {
  if (typeof p_question_id !== 'string' || p_question_id.length === 0) {
    return { correctOptionId: null }
  }

  const { supabase } = await requireAdmin()

  const { data, error } = await supabase.rpc('get_question_authoring_fields', { p_question_id })

  if (error) {
    console.error('[getCorrectOption] RPC error:', error.message)
    return { correctOptionId: null }
  }

  // RETURNS TABLE — data is an array with at most one row.
  return { correctOptionId: data?.[0]?.correct_option_id ?? null }
}
