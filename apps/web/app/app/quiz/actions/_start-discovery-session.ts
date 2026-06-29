import { createServerSupabaseClient } from '@repo/db/server'
import { rpc } from '@/lib/supabase-rpc'

// Maps start_discovery_session RPC error tokens to sanitized domain messages.
// another_session_active is the single-active-session guard (PR A); every other
// validation token stays generic — never leak the raw token to the client.
export function mapDiscoveryStartError(message: string): string {
  if (message.includes('another_session_active')) {
    return 'Finish or exit your active session first.'
  }
  return 'Failed to start study session'
}

/**
 * Creates the real ephemeral discovery session row (enforces the single-active
 * guard). Returns the created session id on success, or a sanitized error message
 * on failure (the other field is null in each case). A success result carrying a
 * null/empty id is treated as a failure — without an id the caller's orphan teardown
 * could not scope to THIS request's row.
 */
export async function createDiscoverySession(
  subjectId: string,
  ids: string[],
): Promise<{ id: string | null; error: string | null }> {
  const supabase = await createServerSupabaseClient()
  const { data, error } = await rpc<string>(supabase, 'start_discovery_session', {
    p_subject_id: subjectId,
    p_question_ids: ids,
  })
  if (error) {
    console.error('[startStudy] start_discovery_session error:', error.message)
    return { id: null, error: mapDiscoveryStartError(error.message) }
  }
  if (typeof data !== 'string' || data.length === 0) {
    console.error('[startStudy] start_discovery_session returned no session id')
    return { id: null, error: 'Failed to start study session' }
  }
  return { id: data, error: null }
}
