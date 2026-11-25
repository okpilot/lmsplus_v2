import type { Database } from '@repo/db/types'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sittingCodeVoidable } from '../_void-policy'

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
  const voidable = sittingCodeVoidable({
    sittingEntryId: data.sitting_entry_id,
    consumed: data.consumed_at !== null,
    sessionEndedAt: data.quiz_sessions?.ended_at ?? null,
    // `consumed_at` is never set without `consumed_session_id` (CHECK `consumed_pair_consistency`),
    // so a null embed means the row is hidden from this caller, not that there is none.
    sessionVisible: data.quiz_sessions !== null,
  })
  if (!voidable) return { ok: false, error: 'Void sitting codes from their sitting' }
  return { ok: true }
}
