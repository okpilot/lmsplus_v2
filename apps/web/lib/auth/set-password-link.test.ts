import { describe, expect, it } from 'vitest'
import {
  buildSetPasswordUrl,
  forgotPasswordSteps,
  LINK_INVALID_MESSAGE,
  LINK_MISSING_MESSAGE,
  SetPasswordLinkSchema,
} from './set-password-link'

const HASH = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90'

describe('SetPasswordLinkSchema', () => {
  it('accepts a hex token hash with the recovery type', () => {
    expect(SetPasswordLinkSchema.safeParse({ tokenHash: HASH, type: 'recovery' }).success).toBe(
      true,
    )
  })

  it.each([
    ['empty', ''],
    ['too short', 'abc123'],
    ['non-hex characters', 'z'.repeat(64)],
    ['a path-like value', '../../etc/passwd'],
    ['over-long', 'a'.repeat(200)],
  ])('rejects a token hash that is %s', (_label, tokenHash) => {
    expect(SetPasswordLinkSchema.safeParse({ tokenHash, type: 'recovery' }).success).toBe(false)
  })

  it('rejects any type other than recovery', () => {
    expect(SetPasswordLinkSchema.safeParse({ tokenHash: HASH, type: 'signup' }).success).toBe(false)
  })
})

describe('buildSetPasswordUrl', () => {
  it('puts the hash and recovery type on the set-password path of the given origin', () => {
    const url = new URL(buildSetPasswordUrl('https://app.example.com', HASH))

    expect(url.origin).toBe('https://app.example.com')
    expect(url.pathname).toBe('/auth/set-password')
    expect(url.searchParams.get('token_hash')).toBe(HASH)
    expect(url.searchParams.get('type')).toBe('recovery')
  })

  it('keeps the origin fixed even if the token hash holds URL syntax', () => {
    const url = new URL(buildSetPasswordUrl('https://app.example.com', 'x&y=1#//evil.test'))

    expect(url.origin).toBe('https://app.example.com')
    expect(url.searchParams.get('token_hash')).toBe('x&y=1#//evil.test')
  })
})

describe('forgotPasswordSteps', () => {
  it('walks from the login page through Forgot password to choosing a password', () => {
    const steps = forgotPasswordSteps()

    expect(steps).toHaveLength(5)
    expect(steps[0]).toMatch(/login page/i)
    expect(steps[1]).toContain('Forgot password?')
    expect(steps.join(' ')).toMatch(/code from the email/i)
    expect(steps.at(-1)).toMatch(/choose a password/i)
  })

  it('never states a digit count for the code', () => {
    expect(forgotPasswordSteps().join(' ')).not.toMatch(/\b\d+[- ]digit/i)
  })
})

describe('link messages', () => {
  it('tell the student the link is unusable without revealing why', () => {
    expect(LINK_INVALID_MESSAGE).toMatch(/expired|already been used/i)
    expect(LINK_MISSING_MESSAGE).toMatch(/link/i)
  })
})
