import { describe, expect, it, vi } from 'vitest'
import {
  CONSENT_COOKIE,
  CURRENT_PRIVACY_VERSION,
  CURRENT_TOS_VERSION,
} from '@/lib/consent/versions'
import { setConsentCookie } from './consent-cookie'

function makeStore() {
  return { set: vi.fn() }
}

describe('setConsentCookie', () => {
  it('sets a cookie value bound to the given user id', () => {
    const store = makeStore()

    setConsentCookie(store, 'user-1')

    expect(store.set).toHaveBeenCalledWith(
      CONSENT_COOKIE,
      `${CURRENT_TOS_VERSION}:${CURRENT_PRIVACY_VERSION}:user-1`,
      expect.objectContaining({ httpOnly: true }),
    )
  })

  it('sets different cookie values for different user ids', () => {
    const store = makeStore()

    setConsentCookie(store, 'user-1')
    setConsentCookie(store, 'user-2')

    const [, valueOne] = store.set.mock.calls[0] as [string, string]
    const [, valueTwo] = store.set.mock.calls[1] as [string, string]
    expect(valueOne).not.toBe(valueTwo)
  })

  it('sets a 1-year max-age', () => {
    const store = makeStore()

    setConsentCookie(store, 'user-1')

    expect(store.set).toHaveBeenCalledWith(
      CONSENT_COOKIE,
      expect.any(String),
      expect.objectContaining({ maxAge: 31_536_000 }),
    )
  })

  it('marks the cookie secure only in production', () => {
    const originalEnv = process.env.NODE_ENV
    const store = makeStore()
    try {
      vi.stubEnv('NODE_ENV', 'production')
      setConsentCookie(store, 'user-1')
      expect(store.set).toHaveBeenCalledWith(
        CONSENT_COOKIE,
        expect.any(String),
        expect.objectContaining({ secure: true }),
      )
    } finally {
      vi.stubEnv('NODE_ENV', originalEnv ?? 'test')
    }
  })
})
