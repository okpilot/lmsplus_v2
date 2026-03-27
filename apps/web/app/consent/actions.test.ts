import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const {
  mockGetUser,
  mockRpc,
  mockCookiesSet,
  mockCookies,
  mockHeaders,
  mockRevalidatePath,
  mockBuildConsentCookieValue,
} = vi.hoisted(() => {
  const mockCookiesSet = vi.fn()
  const mockCookies = vi.fn()
  const mockGetUser = vi.fn()
  const mockRpc = vi.fn()
  const mockHeaders = vi.fn()
  const mockRevalidatePath = vi.fn()
  const mockBuildConsentCookieValue = vi.fn()
  return {
    mockGetUser,
    mockRpc,
    mockCookiesSet,
    mockCookies,
    mockHeaders,
    mockRevalidatePath,
    mockBuildConsentCookieValue,
  }
})

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mockGetUser },
    rpc: mockRpc,
  }),
}))

vi.mock('next/headers', () => ({
  cookies: mockCookies,
  headers: mockHeaders,
}))

vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))

vi.mock('@/lib/consent/check-consent', () => ({
  buildConsentCookieValue: mockBuildConsentCookieValue,
}))

// ---- Subject under test ---------------------------------------------------

import { recordConsent } from './actions'

// ---- Helpers ---------------------------------------------------------------

const USER_ID = 'bbbbbbbb-0000-4000-b000-000000000002'

function mockAuthenticatedUser() {
  mockGetUser.mockResolvedValue({
    data: { user: { id: USER_ID, email: 'student@example.com' } },
    error: null,
  })
}

function mockRpcSuccess() {
  mockRpc.mockResolvedValue({ data: null, error: null })
}

// ---- Tests ----------------------------------------------------------------

function resetHeadersWithDefaultGet(impl?: (header: string) => string | null) {
  const get = vi.fn().mockImplementation(impl ?? (() => null))
  mockHeaders.mockResolvedValue({ get })
  return get
}

beforeEach(() => {
  vi.resetAllMocks()
  mockBuildConsentCookieValue.mockReturnValue('v1.0:v1.0')
  mockCookies.mockResolvedValue({ set: mockCookiesSet })
  resetHeadersWithDefaultGet()
})

describe('recordConsent', () => {
  describe('input validation', () => {
    it('returns failure when acceptedTos is false', async () => {
      const result = await recordConsent({
        acceptedTos: false,
        acceptedPrivacy: true,
        acceptedAnalytics: false,
      })

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('You must accept the Terms of Service')
    })

    it('returns failure when acceptedPrivacy is false', async () => {
      const result = await recordConsent({
        acceptedTos: true,
        acceptedPrivacy: false,
        acceptedAnalytics: false,
      })

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBeTruthy()
    })

    it('returns failure when raw input is not an object', async () => {
      const result = await recordConsent(null)

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBeTruthy()
    })

    it('returns failure when acceptedTos field is missing', async () => {
      const result = await recordConsent({ acceptedPrivacy: true, acceptedAnalytics: false })

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBeTruthy()
    })
  })

  describe('auth guard', () => {
    it('returns failure when not authenticated', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null }, error: null })

      const result = await recordConsent({
        acceptedTos: true,
        acceptedPrivacy: true,
        acceptedAnalytics: false,
      })

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Not authenticated')
    })

    it('returns failure when auth returns an error', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'JWT expired' },
      })

      const result = await recordConsent({
        acceptedTos: true,
        acceptedPrivacy: true,
        acceptedAnalytics: false,
      })

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Not authenticated')
    })
  })

  describe('happy path — TOS and Privacy accepted, analytics declined', () => {
    it('records TOS and Privacy consent and sets the consent cookie', async () => {
      mockAuthenticatedUser()
      mockRpcSuccess()

      const result = await recordConsent({
        acceptedTos: true,
        acceptedPrivacy: true,
        acceptedAnalytics: false,
      })

      expect(result.success).toBe(true)
      expect(mockRpc).toHaveBeenCalledTimes(2)
      expect(mockRpc).toHaveBeenCalledWith(
        'record_consent',
        expect.objectContaining({
          p_document_type: 'terms_of_service',
          p_accepted: true,
        }),
      )
      expect(mockRpc).toHaveBeenCalledWith(
        'record_consent',
        expect.objectContaining({
          p_document_type: 'privacy_policy',
          p_accepted: true,
        }),
      )
      expect(mockCookiesSet).toHaveBeenCalledWith(
        '__consent',
        'v1.0:v1.0',
        expect.objectContaining({ httpOnly: true }),
      )
    })

    it('sets the consent cookie with a 1-year max-age', async () => {
      mockAuthenticatedUser()
      mockRpcSuccess()

      await recordConsent({
        acceptedTos: true,
        acceptedPrivacy: true,
        acceptedAnalytics: false,
      })

      expect(mockCookiesSet).toHaveBeenCalledWith(
        '__consent',
        'v1.0:v1.0',
        expect.objectContaining({ maxAge: 31_536_000 }),
      )
    })

    it('does not call record_consent for analytics when analytics is declined', async () => {
      mockAuthenticatedUser()
      mockRpcSuccess()

      await recordConsent({
        acceptedTos: true,
        acceptedPrivacy: true,
        acceptedAnalytics: false,
      })

      const analyticsCalls = mockRpc.mock.calls.filter(
        (call: unknown[]) =>
          (call[1] as Record<string, unknown>)?.p_document_type === 'cookie_analytics',
      )
      expect(analyticsCalls).toHaveLength(0)
    })
  })

  describe('happy path — analytics accepted', () => {
    it('records TOS, Privacy, and analytics consent when analytics is accepted', async () => {
      mockAuthenticatedUser()
      mockRpcSuccess()

      const result = await recordConsent({
        acceptedTos: true,
        acceptedPrivacy: true,
        acceptedAnalytics: true,
      })

      expect(result.success).toBe(true)
      expect(mockRpc).toHaveBeenCalledTimes(3)
      expect(mockRpc).toHaveBeenCalledWith(
        'record_consent',
        expect.objectContaining({
          p_document_type: 'cookie_analytics',
          p_accepted: true,
        }),
      )
    })
  })

  describe('IP and user-agent forwarding', () => {
    it('passes x-forwarded-for and user-agent headers to each RPC call', async () => {
      mockAuthenticatedUser()
      mockRpcSuccess()
      resetHeadersWithDefaultGet((header) => {
        if (header === 'x-forwarded-for') return '1.2.3.4'
        if (header === 'user-agent') return 'TestAgent/1.0'
        return null
      })

      await recordConsent({
        acceptedTos: true,
        acceptedPrivacy: true,
        acceptedAnalytics: false,
      })

      expect(mockRpc).toHaveBeenCalledWith(
        'record_consent',
        expect.objectContaining({ p_ip_address: '1.2.3.4', p_user_agent: 'TestAgent/1.0' }),
      )
    })

    it('passes null IP and user-agent when headers are absent', async () => {
      mockAuthenticatedUser()
      mockRpcSuccess()
      // headers mock returns null from beforeEach default

      await recordConsent({
        acceptedTos: true,
        acceptedPrivacy: true,
        acceptedAnalytics: false,
      })

      expect(mockRpc).toHaveBeenCalledWith(
        'record_consent',
        expect.objectContaining({ p_ip_address: null, p_user_agent: null }),
      )
    })
  })

  describe('RPC error handling', () => {
    it('returns a sanitized error when TOS consent recording fails', async () => {
      mockAuthenticatedUser()
      mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'db timeout' } })

      const result = await recordConsent({
        acceptedTos: true,
        acceptedPrivacy: true,
        acceptedAnalytics: false,
      })

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Failed to record consent')
      expect(mockCookiesSet).not.toHaveBeenCalled()
    })

    it('returns a sanitized error when Privacy consent recording fails', async () => {
      mockAuthenticatedUser()
      // First call (TOS) succeeds, second call (Privacy) fails
      mockRpc
        .mockResolvedValueOnce({ data: null, error: null })
        .mockResolvedValueOnce({ data: null, error: { message: 'constraint violation' } })

      const result = await recordConsent({
        acceptedTos: true,
        acceptedPrivacy: true,
        acceptedAnalytics: false,
      })

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Failed to record consent')
      expect(mockCookiesSet).not.toHaveBeenCalled()
    })

    it('returns a sanitized error when analytics consent recording fails', async () => {
      mockAuthenticatedUser()
      // TOS and Privacy succeed, analytics fails
      mockRpc
        .mockResolvedValueOnce({ data: null, error: null })
        .mockResolvedValueOnce({ data: null, error: null })
        .mockResolvedValueOnce({ data: null, error: { message: 'server error' } })

      const result = await recordConsent({
        acceptedTos: true,
        acceptedPrivacy: true,
        acceptedAnalytics: true,
      })

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Failed to record consent')
      expect(mockCookiesSet).not.toHaveBeenCalled()
    })
  })
})
