import { RESERVED_VOID_REASONS } from '@repo/db/schema'
import type { Database } from '@repo/db/types'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sittingCodeVoidable } from '../_void-policy'

export type GuardVerdict = { ok: true } | { ok: false; error: string }

function isReservedReason(reason: string): boolean {
  return (RESERVED_VOID_REASONS as readonly string[]).includes(reason)
}

/**
 * Sitting codes are voided from their sitting (decision 264). The exception is a running attempt:
 * `void_sitting_code` refuses it (`code_in_use`) and the sitting page offers Void only for a
 * waiting or ready entry, so the codes tab is its only stop button.
 */
export async function checkSittingCode(
  supabase: SupabaseClient<Database>,
  codeId: string,
  reason: string,
): Promise<GuardVerdict> {
  const { data, error } = await supabase
    .from('internal_exam_codes')
    .select('sitting_entry_id, consumed_at, voided_at, quiz_sessions!consumed_session_id(ended_at)')
    .eq('id', codeId)
    .maybeSingle()
  if (error) {
    console.error('[checkSittingCode] lookup error:', error.message)
    return { ok: false, error: 'Failed to void internal exam code' }
  }
  // Fail closed: the legacy `void_internal_exam_code` has no sitting guard of its own (#1820).
  if (!data) return { ok: false, error: 'Code not found' }
  if (data.sitting_entry_id === null) return { ok: true }

  // This path is the ONLY way to stop a running sitting attempt, so it is the only way a sitting
  // code can reach the legacy RPC, which accepts any reason (#1820). `VOID_REASON_LABEL` renders a
  // system token as a system reason and the notice readers count it, so refuse one here as
  // `void_sitting_code` does. Same message as `VoidSittingCodeSchema`.
  if (isReservedReason(reason)) {
    return { ok: false, error: 'reason must not be a system void reason' }
  }

  const voidable = sittingCodeVoidable({
    sittingEntryId: data.sitting_entry_id,
    consumed: data.consumed_at !== null,
    sessionEndedAt: data.quiz_sessions?.ended_at ?? null,
    // `consumed_at` is never set without `consumed_session_id` (CHECK `consumed_pair_consistency`),
    // so a null embed means the row is hidden from this caller, not that there is none.
    sessionVisible: data.quiz_sessions !== null,
  })
  if (voidable) return { ok: true }

  // Point at the sitting only for a state the sitting can act on: an unused code. An already-voided
  // code needs no second void, and a consumed one is not voidable anywhere — the sitting offers
  // Void for a waiting or ready entry only, and `void_sitting_code` refuses it with `code_in_use`.
  if (data.voided_at) return { ok: false, error: 'Code is already voided' }
  if (data.consumed_at === null) {
    return { ok: false, error: 'Void sitting codes from their sitting' }
  }
  if (data.quiz_sessions?.ended_at) {
    return { ok: false, error: 'Cannot void a finished attempt — record is final' }
  }
  return { ok: false, error: 'This attempt was discarded — there is nothing to void' }
}
