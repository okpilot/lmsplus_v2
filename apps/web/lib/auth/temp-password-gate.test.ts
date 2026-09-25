import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest'
import { checkTempPasswordGate } from './temp-password-gate'

const { mockReadTempPasswordState, mockExpireTempPassword } = vi.hoisted(() => ({
  mockReadTempPasswordState: vi.fn(),
  mockExpireTempPassword: vi.fn(),
}))

vi.mock('@/lib/auth/temp-password', () => ({
  readTempPasswordState: mockReadTempPasswordState,
  expireTempPassword: mockExpireTempPassword,
}))

const REQUEST_URL = 'http://localhost:3000/app/dashboard'
const SUPABASE_STUB = {} as Parameters<typeof checkTempPasswordGate>[0]['supabase']

describe('checkTempPasswordGate', () => {
  let redirectWithCookies: Mock<(url: URL) => Response>
  let buildServiceUnavailable: Mock<() => Response>
  const SERVICE_UNAVAILABLE_RESPONSE = new Response('Service unavailable', { status: 503 })

  beforeEach(() => {
    vi.clearAllMocks()
    redirectWithCookies = vi.fn((url: URL) => Response.redirect(url))
    buildServiceUnavailable = vi.fn(() => SERVICE_UNAVAILABLE_RESPONSE)
  })

  it('returns null when no temp password is armed', async () => {
    mockReadTempPasswordState.mockResolvedValue('none')

    const result = await checkTempPasswordGate({
      supabase: SUPABASE_STUB,
      userId: 'user-1',
      requestUrl: REQUEST_URL,
      nextPath: '/app/dashboard',
      buildServiceUnavailable,
      redirectWithCookies,
    })

    expect(result).toBeNull()
    expect(redirectWithCookies).not.toHaveBeenCalled()
    expect(buildServiceUnavailable).not.toHaveBeenCalled()
  })

  it('redirects to set-password with the next param when armed and a next path is given', async () => {
    mockReadTempPasswordState.mockResolvedValue('active')

    await checkTempPasswordGate({
      supabase: SUPABASE_STUB,
      userId: 'user-1',
      requestUrl: REQUEST_URL,
      nextPath: '/app/internal-exam',
      buildServiceUnavailable,
      redirectWithCookies,
    })

    expect(redirectWithCookies).toHaveBeenCalledTimes(1)
    const url = redirectWithCookies.mock.calls[0]?.[0] as URL
    expect(url.pathname).toBe('/auth/set-password')
    expect(url.searchParams.get('next')).toBe('/app/internal-exam')
  })

  it('redirects to set-password with no next param when armed and no next path is given', async () => {
    mockReadTempPasswordState.mockResolvedValue('active')

    await checkTempPasswordGate({
      supabase: SUPABASE_STUB,
      userId: 'user-1',
      requestUrl: REQUEST_URL,
      nextPath: null,
      buildServiceUnavailable,
      redirectWithCookies,
    })

    const url = redirectWithCookies.mock.calls[0]?.[0] as URL
    expect(url.pathname).toBe('/auth/set-password')
    expect(url.searchParams.has('next')).toBe(false)
  })

  it('returns the redirectWithCookies result for the active state', async () => {
    mockReadTempPasswordState.mockResolvedValue('active')
    const sentinel = new Response(null, { status: 307 })
    redirectWithCookies.mockReturnValue(sentinel)

    const result = await checkTempPasswordGate({
      supabase: SUPABASE_STUB,
      userId: 'user-1',
      requestUrl: REQUEST_URL,
      nextPath: null,
      buildServiceUnavailable,
      redirectWithCookies,
    })

    expect(result).toBe(sentinel)
  })

  it('expires the temp password with the user id and redirects to the expired-password error page', async () => {
    mockReadTempPasswordState.mockResolvedValue('expired')

    await checkTempPasswordGate({
      supabase: SUPABASE_STUB,
      userId: 'user-1',
      requestUrl: REQUEST_URL,
      nextPath: '/app/internal-exam',
      buildServiceUnavailable,
      redirectWithCookies,
    })

    expect(mockExpireTempPassword).toHaveBeenCalledWith(SUPABASE_STUB, 'user-1')
    expect(redirectWithCookies).toHaveBeenCalledTimes(1)
    const url = redirectWithCookies.mock.calls[0]?.[0] as URL
    expect(url.toString()).toBe('http://localhost:3000/?error=temp_password_expired')
  })

  it('returns the buildServiceUnavailable response and logs when the state read throws', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockReadTempPasswordState.mockRejectedValue(new Error('connection reset'))

    const result = await checkTempPasswordGate({
      supabase: SUPABASE_STUB,
      userId: 'user-1',
      requestUrl: REQUEST_URL,
      nextPath: null,
      buildServiceUnavailable,
      redirectWithCookies,
    })

    expect(result).toBe(SERVICE_UNAVAILABLE_RESPONSE)
    expect(buildServiceUnavailable).toHaveBeenCalledTimes(1)
    expect(redirectWithCookies).not.toHaveBeenCalled()
    expect(mockExpireTempPassword).not.toHaveBeenCalled()
    expect(consoleSpy).toHaveBeenCalledWith(
      '[proxy] temp password state read error:',
      'connection reset',
    )
    consoleSpy.mockRestore()
  })
})
