// A start action fails with `blocked: true` when another session is open, so the UI can offer
// to save that session for later. No 'use server' — imported by the start actions.

export const ANOTHER_SESSION_ACTIVE = 'another_session_active'

/** Adds an optional `blocked` flag to every failure variant of a start result. */
export type WithBlocked<T> = T extends { success: false } ? T & { blocked?: true } : T

/** Spread into a failure result: `{ blocked: true }` for the single-active-session token, else nothing. */
export function blockedFlag(rpcMessage: string | undefined): { blocked?: true } {
  return rpcMessage?.includes(ANOTHER_SESSION_ACTIVE) ? { blocked: true } : {}
}

const BLOCKED_MESSAGE =
  'You already have an active session. Finish or discard it before starting a new one.'

/** The blocked failure result for the single-active-session token, or null for any other error. */
export function blockedFailure(
  rpcMessage: string | undefined,
): { success: false; error: string; blocked: true } | null {
  return blockedFlag(rpcMessage).blocked
    ? { success: false, error: BLOCKED_MESSAGE, blocked: true }
    : null
}
