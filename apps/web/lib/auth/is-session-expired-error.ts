import { type AuthError, isAuthSessionMissingError } from '@supabase/supabase-js'

const EXPIRED_CODES: readonly string[] = [
  'session_not_found',
  'session_expired',
  'refresh_token_not_found',
  'refresh_token_already_used',
]

/** True when GoTrue reports the caller's session as missing or expired (error class / code, not message text). */
export function isSessionExpiredAuthError(error: AuthError): boolean {
  return (
    isAuthSessionMissingError(error) ||
    (error.code !== undefined && EXPIRED_CODES.includes(error.code))
  )
}
