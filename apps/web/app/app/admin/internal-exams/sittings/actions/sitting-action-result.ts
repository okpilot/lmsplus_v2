import { revalidatePath } from 'next/cache'
import { matchRpcError } from '@/lib/rpc-error-match'

export type SittingActionResult<T extends object = Record<string, never>> =
  | ({ success: true } & T)
  | { success: false; error: string }

export const SITTING_RPC_ERRORS: Record<string, string> = {
  not_authenticated: 'Not authorized',
  not_admin: 'Not authorized',
  admin_not_found: 'Not authorized',
  invalid_input: 'Invalid input',
  sitting_not_found: 'Sitting not found',
  sitting_closed: 'This sitting is closed and cannot be changed.',
  sitting_day_ended: "This sitting's day has ended.",
  sitting_not_editable: 'Time and mode cannot be changed once the sitting is open.',
  sitting_not_scheduled: 'This sitting has already been started.',
  sitting_not_due:
    'Too early: a sitting can start from its UTC day. Edit the date to run it earlier.',
  sitting_not_open: 'This sitting is not open.',
  sitting_has_attempts: 'A candidate has already taken an exam in this sitting.',
  scheduled_in_past: 'The sitting date must be today or later (UTC).',
  invigilator_not_found:
    'The invigilator must be an active admin or instructor of your organization',
  too_many_candidates: 'A sitting can hold at most 500 people.',
  too_many_entries: 'A sitting can hold at most 2000 exams.',
  subject_not_found: 'An exam you picked no longer exists. Reload and try again.',
  exam_config_required: 'An exam you picked is not set up as an internal exam.',
  candidate_has_attempt:
    'Someone you selected has taken an exam. History is permanent: they cannot be removed.',
  candidate_not_found: 'Someone you selected is no longer in this sitting. Reload the page.',
  entry_has_attempt: 'This exam has been taken. It cannot be removed.',
  entry_not_found: 'This exam is no longer in the sitting. Reload the page.',
  student_not_found: 'A person you selected no longer exists. Reload and try again.',
  code_generation_failed: 'Could not generate a unique code. Try again.',
  group_not_found: 'This group no longer exists.',
}

export function sittingFailure(message: string, fallback: string) {
  console.error('[sitting] RPC error:', message)
  return { success: false as const, error: matchRpcError(message, SITTING_RPC_ERRORS) ?? fallback }
}

/** First row of an RPC result as a plain record, or null. */
export function firstRow(data: unknown): Record<string, unknown> | null {
  const row = Array.isArray(data) ? data[0] : data
  return typeof row === 'object' && row !== null ? (row as Record<string, unknown>) : null
}

export function num(row: Record<string, unknown>, key: string): number {
  const v = row[key]
  return typeof v === 'number' ? v : 0
}

export const SITTING_ROOT = '/app/admin/internal-exams'

export function revalidateSitting(sittingId: string) {
  revalidatePath(SITTING_ROOT)
  revalidatePath(`${SITTING_ROOT}/sittings/${sittingId}`)
}
