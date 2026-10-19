import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const {
  mockVerifySessionUser,
  mockRpc,
  mockCookiesSet,
  mockCookies,
  mockHeaders,
  mockRevalidatePath,
  mockSetConsentCookie,
} = vi.hoisted(() => {
  const mockCookiesSet = vi.fn()
  const mockCookies = vi.fn()
  const mockVerifySessionUser = vi.fn()
  const mockRpc = vi.fn()
  const mockHeaders = vi.fn()
  const mockRevalidatePath = vi.fn()
  const mockSetConsentCookie = vi.fn()
  return {
    mockVerifySessionUser,
    mockRpc,
    mockCookiesSet,
    mockCookies,
    mockHeaders,
    mockRevalidatePath,
    mockSetConsentCookie,
  }
})

const client = { rpc: mockRpc }

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => client,
}))

vi.mock('@/lib/auth/verify-session-user', () => ({
  verifySessionUser: mockVerifySessionUser,
}))

vi.mock('next/headers', () => ({
  cookies: mockCookies,
  headers: mockHeaders,
}))

vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))

vi.mock('@/lib/consent/consent-cookie', () => ({
  setConsentCookie: mockSetConsentCookie,
}))

// ---- Subject under test ---------------------------------------------------

import { recordConsent } from './actions'

// ---- Helpers ---------------------------------------------------------------

const USER_ID = 'bbbbbbbb-0000-4000-b000-000000000002'

function mockAuthenticatedUser() {
  mockVerifySessionUser.mockResolvedValue({ id: USER_ID, email: 'student@example.com' })
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
  mockCookies.mockResolvedValue({ set: mockCookiesSet })
  resetHeadersWithDefaultGet()
})

describe('recordConsent', () => {
  describe('input validation', () => {
    it('returns failure when acceptedTos is false', async () => {
      const result = await recordConsent({
        acceptedTos: false,
        acceptedPrivacy: true,
      })

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('You must accept the Terms of Service')
    })

    it('returns failure when acceptedPrivacy is false', async () => {
      const result = await recordConsent({
        acceptedTos: true,
        acceptedPrivacy: false,
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
      const result = await recordConsent({ acceptedPrivacy: true })

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBeTruthy()
    })
  })

  describe('auth guard', () => {
    it('returns failure and records nothing when there is no verified session user', async () => {
      mockVerifySessionUser.mockResolvedValue(null)

      const result = await recordConsent({
        acceptedTos: true,
        acceptedPrivacy: true,
      })

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Not authenticated')
      expect(mockRpc).not.toHaveBeenCalled()
      expect(mockSetConsentCookie).not.toHaveBeenCalled()
    })

    it('records consent for the user verified on the session client', async () => {
      mockAuthenticatedUser()
      mockRpcSuccess()

      const result = await recordConsent({
        acceptedTos: true,
        acceptedPrivacy: true,
      })

      expect(result.success).toBe(true)
      expect(mockVerifySessionUser).toHaveBeenCalledWith(client)
    })

    it('records consent for a verified session even when a live Auth lookup would fail', async () => {
      // The client exposes no auth.getUser, so any getUser() call would throw.
      mockAuthenticatedUser()
      mockRpcSuccess()

      const result = await recordConsent({
        acceptedTos: true,
        acceptedPrivacy: true,
      })

      expect(result.success).toBe(true)
      expect(mockRpc).toHaveBeenCalledTimes(2)
    })

    it('sets the consent cookie for the verified user id', async () => {
      mockAuthenticatedUser()
      mockRpcSuccess()

      await recordConsent({
        acceptedTos: true,
        acceptedPrivacy: true,
      })

      expect(mockSetConsentCookie).toHaveBeenCalledWith(expect.anything(), USER_ID)
    })
  })

  describe('happy path — TOS and Privacy accepted', () => {
    it('records TOS and Privacy consent and sets the consent cookie', async () => {
      mockAuthenticatedUser()
      mockRpcSuccess()

      const result = await recordConsent({
        acceptedTos: true,
        acceptedPrivacy: true,
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
      expect(mockSetConsentCookie).toHaveBeenCalledWith(
        expect.objectContaining({ set: mockCookiesSet }),
        USER_ID,
      )
    })

    it('only records TOS and Privacy — no analytics consent', async () => {
      mockAuthenticatedUser()
      mockRpcSuccess()

      await recordConsent({
        acceptedTos: true,
        acceptedPrivacy: true,
      })

      expect(mockRpc).toHaveBeenCalledTimes(2)
      const callTypes = mockRpc.mock.calls.map(
        (call: unknown[]) => (call[1] as Record<string, unknown>)?.p_document_type,
      )
      expect(callTypes).toEqual(['terms_of_service', 'privacy_policy'])
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
      })

      expect(mockRpc).toHaveBeenCalledWith(
        'record_consent',
        expect.objectContaining({ p_ip_address: '1.2.3.4', p_user_agent: 'TestAgent/1.0' }),
      )
    })

    it('passes null IP and user-agent when headers are absent', async () => {
      mockAuthenticatedUser()
      mockRpcSuccess()

      await recordConsent({
        acceptedTos: true,
        acceptedPrivacy: true,
      })

      expect(mockRpc).toHaveBeenCalledWith(
        'record_consent',
        expect.objectContaining({ p_ip_address: null, p_user_agent: null }),
      )
    })
  })

  describe('RPC error handling', () => {
    it('starts both consent records before either finishes', async () => {
      mockAuthenticatedUser()
      let resolveTos: (v: unknown) => void = () => {}
      mockRpc
        .mockReturnValueOnce(
          new Promise((resolve) => {
            resolveTos = resolve
          }),
        )
        .mockResolvedValueOnce({ data: null, error: null })

      const pending = recordConsent({ acceptedTos: true, acceptedPrivacy: true })
      await vi.waitFor(() => expect(mockRpc).toHaveBeenCalledTimes(2))
      resolveTos({ data: null, error: null })

      await expect(pending).resolves.toEqual({ success: true })
    })

    it('logs both failures and sets no cookie when both consent records fail', async () => {
      mockAuthenticatedUser()
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockRpc
        .mockResolvedValueOnce({ data: null, error: { message: 'tos down' } })
        .mockResolvedValueOnce({ data: null, error: { message: 'privacy down' } })

      const result = await recordConsent({ acceptedTos: true, acceptedPrivacy: true })

      expect(result).toEqual({ success: false, error: 'Failed to record consent' })
      expect(mockSetConsentCookie).not.toHaveBeenCalled()
      expect(errorSpy.mock.calls).toEqual([
        ['[recordConsent] TOS record error:', 'tos down'],
        ['[recordConsent] Privacy record error:', 'privacy down'],
      ])
    })

    it('returns a sanitized error when TOS consent recording fails', async () => {
      mockAuthenticatedUser()
      mockRpc
        .mockResolvedValueOnce({ data: null, error: { message: 'db timeout' } })
        .mockResolvedValueOnce({ data: null, error: null })

      const result = await recordConsent({
        acceptedTos: true,
        acceptedPrivacy: true,
      })

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Failed to record consent')
      expect(mockSetConsentCookie).not.toHaveBeenCalled()
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
      })

      expect(result.success).toBe(false)
      if (result.success) return
      expect(result.error).toBe('Failed to record consent')
      expect(mockSetConsentCookie).not.toHaveBeenCalled()
    })
  })
})
