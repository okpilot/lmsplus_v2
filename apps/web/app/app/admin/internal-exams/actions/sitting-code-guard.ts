import { RESERVED_VOID_REASONS } from '@repo/db/schema'
import type { Database } from '@repo/db/types'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sittingCodeVoidable } from '../_void-policy'

export type GuardVerdict = { ok: true } | { ok: false; error: string }

type CodeRow = {
  sitting_entry_id: string | null
  consumed_at: string | null
  voided_at: string | null
  quiz_sessions: { ended_at: string | null } | null
}

function isReservedReason(reason: string): boolean {
  return (RESERVED_VOID_REASONS as readonly string[]).includes(reason)
}

/** Why this code cannot be voided. Reached only once `sittingCodeVoidable` has said no. */
function refusal(row: CodeRow): string {
  if (row.voided_at) return 'Code is already voided'
  if (row.consumed_at === null) return 'Void sitting codes from their sitting'
  if (row.quiz_sessions?.ended_at) return 'Cannot void a finished attempt — record is final'
  return 'This attempt was discarded — there is nothing to void'
}

/**
 * The reserved-reason check covers EVERY code, legacy ones included: `void_internal_exam_code`
 * writes any reason straight to `void_reason` (#1820), where a system token renders as a system
 * void and the notice readers count it. A free-text reason must never be able to forge one.
 */
export async function checkSittingCode(
  supabase: SupabaseClient<Database>,
  codeId: string,
  reason: string,
): Promise<GuardVerdict> {
  if (isReservedReason(reason)) {
    return { ok: false, error: 'reason must not be a system void reason' }
  }
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

  const voidable = sittingCodeVoidable({
    sittingEntryId: data.sitting_entry_id,
    consumed: data.consumed_at !== null,
    sessionEndedAt: data.quiz_sessions?.ended_at ?? null,
    // An invisible session row is hidden by `instructors_read_sessions`, not absent.
    sessionVisible: data.quiz_sessions !== null,
  })
  return voidable ? { ok: true } : { ok: false, error: refusal(data) }
}
