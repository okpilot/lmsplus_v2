import { describe, expect, it } from 'vitest'
import { scrubBreadcrumbTokens, scrubEventTokens } from './sentry-token-scrub'

describe('scrubBreadcrumbTokens', () => {
  it.each(['url', 'to', 'from'])('filters token_hash in the %s field', (field) => {
    const out = scrubBreadcrumbTokens({
      data: { [field]: 'https://x.test/auth/set-password?type=recovery&token_hash=secret123' },
    })
    expect(out.data?.[field]).not.toContain('secret123')
    expect(out.data?.[field]).toContain('type=recovery')
    expect(out.data?.[field]).toContain('token_hash=[Filtered]')
  })

  it('filters a relative URL', () => {
    const out = scrubBreadcrumbTokens({ data: { to: '/auth/set-password?token_hash=secret123' } })
    expect(out.data?.to).not.toContain('secret123')
    expect(out.data?.to).toMatch(/^\/auth\/set-password\?/)
  })

  it('leaves URLs without token_hash and non-string fields untouched', () => {
    const data = { url: '/app/dashboard?x=1', status_code: 200, to: undefined }
    expect(scrubBreadcrumbTokens({ data: { ...data } }).data).toEqual(data)
  })

  it('returns a breadcrumb with no data unchanged', () => {
    expect(scrubBreadcrumbTokens({})).toEqual({})
  })
})

describe('scrubEventTokens', () => {
  it('filters token_hash in the request URL and keeps the rest', () => {
    const out = scrubEventTokens({
      request: { url: 'https://x.test/auth/set-password?token_hash=secret123&type=recovery' },
    })
    expect(out.request?.url).toBe(
      'https://x.test/auth/set-password?token_hash=[Filtered]&type=recovery',
    )
  })

  it('returns an event with no request unchanged', () => {
    const event = { message: 'boom', request: undefined }
    expect(scrubEventTokens(event)).toEqual(event)
  })

  it('leaves a request URL without token_hash unchanged', () => {
    const event = { request: { url: 'https://x.test/app/dashboard?x=1' } }
    expect(scrubEventTokens(event).request?.url).toBe('https://x.test/app/dashboard?x=1')
  })
})
