import { SITTING_RPC_ERRORS } from '../actions/sitting-action-result'

/** The refusal copies (`SITTING_RPC_ERRORS.sitting_closed` / `.sitting_day_ended`). */
export type SittingEmailRefusal =
  | 'This sitting is closed and cannot be changed.'
  | "This sitting's day has ended."

const utcDay = (iso: string) => new Date(iso).toISOString().slice(0, 10)

/** Why a sitting's code emails must not go out (closed, cancelled, or its UTC day is over), else null. */
export function sittingEmailRefusal(
  status: string,
  scheduledAt: string,
): SittingEmailRefusal | null {
  if (status === 'closed' || status === 'cancelled') {
    return SITTING_RPC_ERRORS.sitting_closed as SittingEmailRefusal
  }
  return utcDay(scheduledAt) < utcDay(new Date().toISOString())
    ? (SITTING_RPC_ERRORS.sitting_day_ended as SittingEmailRefusal)
    : null
}
