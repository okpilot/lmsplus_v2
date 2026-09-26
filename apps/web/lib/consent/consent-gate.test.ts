import { describe, expect, it, vi } from 'vitest'
import { checkConsentGate } from './consent-gate'

function makeRedirectWithCookies() {
  return vi.fn((url: URL) => new Response(null, { headers: { location: url.href } }))
}

function makeOpts(
  redirectWithCookies: ReturnType<typeof makeRedirectWithCookies>,
  overrides: Partial<Omit<Parameters<typeof checkConsentGate>[0], 'redirectWithCookies'>> = {},
) {
  return {
    userId: 'user-1',
    cookieValue: 'v1.0:v1.0:user-1',
    nextPath: null,
    requestUrl: 'http://localhost:3000/app/dashboard',
    redirectWithCookies,
    ...overrides,
  }
}

describe('checkConsentGate', () => {
  it('falls through when the cookie matches the requesting user', () => {
    const result = checkConsentGate(makeOpts(makeRedirectWithCookies()))
    expect(result).toBeNull()
  })

  it('redirects to consent-refresh when no cookie is present', () => {
    const redirectWithCookies = makeRedirectWithCookies()

    checkConsentGate(makeOpts(redirectWithCookies, { cookieValue: undefined }))

    const [url] = redirectWithCookies.mock.calls[0] ?? []
    expect(url).toBeDefined()
    expect(url?.pathname).toBe('/auth/consent-refresh')
  })

  it('redirects to consent-refresh when the cookie belongs to a different user', () => {
    const redirectWithCookies = makeRedirectWithCookies()

    checkConsentGate(
      makeOpts(redirectWithCookies, { userId: 'user-1', cookieValue: 'v1.0:v1.0:someone-else' }),
    )

    expect(redirectWithCookies).toHaveBeenCalled()
  })

  it('carries the next path as a query param on the redirect', () => {
    const redirectWithCookies = makeRedirectWithCookies()

    checkConsentGate(
      makeOpts(redirectWithCookies, { cookieValue: undefined, nextPath: '/app/quiz' }),
    )

    const [url] = redirectWithCookies.mock.calls[0] ?? []
    expect(url?.searchParams.get('next')).toBe('/app/quiz')
  })

  it('omits the next query param when there is no next path', () => {
    const redirectWithCookies = makeRedirectWithCookies()

    checkConsentGate(makeOpts(redirectWithCookies, { cookieValue: undefined, nextPath: null }))

    const [url] = redirectWithCookies.mock.calls[0] ?? []
    expect(url?.searchParams.has('next')).toBe(false)
  })
})
