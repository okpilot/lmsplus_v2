import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockVerifyOtp, mockSignOut, mockFrom, mockComplete, chain } = vi.hoisted(() => ({
  mockVerifyOtp: vi.fn(),
  mockSignOut: vi.fn(),
  mockFrom: vi.fn(),
  mockComplete: vi.fn(),
  chain: {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    maybeSingle: vi.fn(),
  },
}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { verifyOtp: mockVerifyOtp, signOut: mockSignOut },
    from: mockFrom,
  }),
}))

vi.mock('./complete-link-password-set', () => ({
  completeLinkPasswordSet: (...args: unknown[]) => mockComplete(...args),
}))

import { LINK_INVALID_MESSAGE } from '@/lib/auth/set-password-link'
import { setPasswordFromLink } from './actions'

const USER_ID = 'aaaaaaaa-0000-4000-a000-000000000003'
const TOKEN_HASH = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90'
const validInput = {
  password: 'newpassword123',
  confirmPassword: 'newpassword123',
  tokenHash: TOKEN_HASH,
  type: 'recovery',
}

beforeEach(() => {
  vi.resetAllMocks()
  mockFrom.mockReturnValue(chain)
  chain.select.mockReturnValue(chain)
  chain.eq.mockReturnValue(chain)
  chain.is.mockReturnValue(chain)
  chain.maybeSingle.mockResolvedValue({ data: { id: USER_ID }, error: null })
  mockVerifyOtp.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
  mockSignOut.mockResolvedValue({ error: null })
  mockComplete.mockResolvedValue({ success: true, redirectTo: '/auth/login-complete' })
})

describe('setPasswordFromLink', () => {
  describe('input validation', () => {
    it('refuses a too-short password without consuming the token', async () => {
      const result = await setPasswordFromLink({
        ...validInput,
        password: 'ab',
        confirmPassword: 'ab',
      })

      expect(result).toEqual({ success: false, error: 'Password must be at least 6 characters' })
      expect(mockVerifyOtp).not.toHaveBeenCalled()
    })

    it('refuses mismatched passwords without consuming the token', async () => {
      const result = await setPasswordFromLink({ ...validInput, confirmPassword: 'nope' })

      expect(result).toEqual({ success: false, error: 'Passwords do not match' })
      expect(mockVerifyOtp).not.toHaveBeenCalled()
    })

    it('reports a malformed token hash as an unusable link without consuming anything', async () => {
      const result = await setPasswordFromLink({ ...validInput, tokenHash: 'not-hex!' })

      expect(result).toEqual({ success: false, error: LINK_INVALID_MESSAGE, linkInvalid: true })
      expect(mockVerifyOtp).not.toHaveBeenCalled()
    })

    it('reports the password problem first when both password and token are bad', async () => {
      const result = await setPasswordFromLink({
        password: 'ab',
        confirmPassword: 'ab',
        tokenHash: 'bad',
        type: 'recovery',
      })

      expect(result).toEqual({ success: false, error: 'Password must be at least 6 characters' })
    })

    it('refuses non-object input', async () => {
      const result = await setPasswordFromLink(null)

      expect(result.success).toBe(false)
      expect(mockVerifyOtp).not.toHaveBeenCalled()
    })
  })

  describe('token verification', () => {
    it('verifies the token hash as a recovery token', async () => {
      await setPasswordFromLink(validInput)

      expect(mockVerifyOtp).toHaveBeenCalledWith({ token_hash: TOKEN_HASH, type: 'recovery' })
    })

    it('reports an expired or used link and never logs the token', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockVerifyOtp.mockResolvedValue({ data: { user: null }, error: { message: 'Token expired' } })

      const result = await setPasswordFromLink(validInput)

      expect(result).toEqual({ success: false, error: LINK_INVALID_MESSAGE, linkInvalid: true })
      expect(mockComplete).not.toHaveBeenCalled()
      expect(spy).toHaveBeenCalled()
      expect(JSON.stringify(spy.mock.calls)).not.toContain(TOKEN_HASH)
    })

    it('reports an unusable link when verification returns no user', async () => {
      mockVerifyOtp.mockResolvedValue({ data: { user: null }, error: null })

      const result = await setPasswordFromLink(validInput)

      expect(result).toEqual({ success: false, error: LINK_INVALID_MESSAGE, linkInvalid: true })
    })
  })

  describe('active-user gate', () => {
    it('reads only a live users row for the verified user', async () => {
      await setPasswordFromLink(validInput)

      expect(mockFrom).toHaveBeenCalledWith('users')
      expect(chain.eq).toHaveBeenCalledWith('id', USER_ID)
      expect(chain.is).toHaveBeenCalledWith('deleted_at', null)
    })

    it('signs out locally, logs the refusal and reports an unusable link when the account is gone', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      chain.maybeSingle.mockResolvedValue({ data: null, error: null })

      const result = await setPasswordFromLink(validInput)

      expect(result).toEqual({ success: false, error: LINK_INVALID_MESSAGE, linkInvalid: true })
      expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' })
      expect(mockComplete).not.toHaveBeenCalled()
      expect(spy).toHaveBeenCalledWith('[setPasswordFromLink] no live account for user:', USER_ID)
    })

    it('signs out locally and reports an unusable link when the account read errors after the token was spent', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      chain.maybeSingle.mockResolvedValue({ data: null, error: { message: 'db down' } })

      const result = await setPasswordFromLink(validInput)

      expect(result).toEqual({ success: false, error: LINK_INVALID_MESSAGE, linkInvalid: true })
      expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' })
      expect(mockComplete).not.toHaveBeenCalled()
      expect(spy).toHaveBeenCalledWith('[setPasswordFromLink] account read failed:', 'db down')
    })

    it('logs a failed local sign-out and still refuses the link', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      chain.maybeSingle.mockResolvedValue({ data: null, error: null })
      mockSignOut.mockResolvedValue({ error: { message: 'signout boom' } })

      const result = await setPasswordFromLink(validInput)

      expect(result).toEqual({ success: false, error: LINK_INVALID_MESSAGE, linkInvalid: true })
      expect(spy).toHaveBeenCalledWith(
        '[setPasswordFromLink] local sign-out failed:',
        'signout boom',
      )
    })
  })

  describe('completion', () => {
    it('hands the verified user id and password to the completion step', async () => {
      const result = await setPasswordFromLink(validInput)

      expect(mockComplete).toHaveBeenCalledWith(expect.anything(), {
        userId: USER_ID,
        password: 'newpassword123',
      })
      expect(result).toEqual({ success: true, redirectTo: '/auth/login-complete' })
    })

    it('passes the completion failure through unchanged', async () => {
      const failure = { success: false, error: 'x', redirectTo: '/auth/reset-password' }
      mockComplete.mockResolvedValue(failure)

      await expect(setPasswordFromLink(validInput)).resolves.toEqual(failure)
    })
  })
})
