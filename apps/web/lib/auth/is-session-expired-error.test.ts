import { AuthApiError, AuthSessionMissingError } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { isSessionExpiredAuthError } from './is-session-expired-error'

describe('isSessionExpiredAuthError', () => {
  it('is true for AuthSessionMissingError', () => {
    expect(isSessionExpiredAuthError(new AuthSessionMissingError())).toBe(true)
  })

  it.each(['session_not_found', 'session_expired'])('is true for AuthApiError code %s', (code) => {
    expect(isSessionExpiredAuthError(new AuthApiError('gone', 403, code))).toBe(true)
  })

  it('is false for an unrelated AuthApiError code', () => {
    expect(isSessionExpiredAuthError(new AuthApiError('bad', 400, 'invalid_credentials'))).toBe(
      false,
    )
  })

  it('is false for an AuthApiError without a code', () => {
    expect(isSessionExpiredAuthError(new AuthApiError('x', 400, undefined))).toBe(false)
  })
})
