import type { Database } from '@repo/db/types'
import type { SupabaseClient } from '@supabase/supabase-js'

type CodeLookup = {
  sitting_entry_id: string | null
  consumed_at: string | null
  quiz_sessions: { ended_at: string | null } | null
}

/**
 * A consumed sitting code whose attempt is still running. `consumed_at` is never set without
 * `consumed_session_id` (CHECK `consumed_pair_consistency`), so a null embed means the session row
 * is hidden from this caller, not that there is none — that case fails closed.
 */
function isRunningAttempt(row: CodeLookup): boolean {
  return (
    row.consumed_at !== null && row.quiz_sessions !== null && row.quiz_sessions.ended_at === null
  )
}

export type GuardVerdict = { ok: true } | { ok: false; error: string }

/**
 * Sitting codes are voided from their sitting (decision 264). The exception is a running attempt:
 * `void_sitting_code` refuses it (`code_in_use`) and the sitting page offers Void only for a
 * waiting or ready entry, so the codes tab is its only stop button.
 */
export async function checkSittingCode(
  supabase: SupabaseClient<Database>,
  codeId: string,
): Promise<GuardVerdict> {
  const { data, error } = await supabase
    .from('internal_exam_codes')
    .select('sitting_entry_id, consumed_at, quiz_sessions!consumed_session_id(ended_at)')
    .eq('id', codeId)
    .maybeSingle()
  if (error) {
    console.error('[checkSittingCode] lookup error:', error.message)
    return { ok: false, error: 'Failed to void internal exam code' }
  }
  // Fail closed: the legacy `void_internal_exam_code` has no sitting guard of its own (#1820).
  if (!data) return { ok: false, error: 'Code not found' }
  if (data.sitting_entry_id && !isRunningAttempt(data)) {
    return { ok: false, error: 'Void sitting codes from their sitting' }
  }
  return { ok: true }
}
