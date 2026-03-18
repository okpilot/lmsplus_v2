import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from './route'

const mockVerifyOtp = vi.fn()

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: {
      verifyOtp: mockVerifyOtp,
    },
  }),
}))

// next/navigation redirect throws a special error that Next.js catches
const mockRedirect = vi.fn()
vi.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => {
    mockRedirect(...args)
    throw new Error(`NEXT_REDIRECT:${args[0]}`)
  },
}))

function makeRequest(url: string) {
  return new NextRequest(url)
}

describe('GET /auth/confirm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('redirects to next param after successful OTP verification', async () => {
    mockVerifyOtp.mockResolvedValue({ error: null })

    await expect(
      GET(
        makeRequest(
          'http://localhost:3000/auth/confirm?token_hash=abc123&type=recovery&next=/auth/reset-password',
        ),
      ),
    ).rejects.toThrow('NEXT_REDIRECT:/auth/reset-password')

    expect(mockVerifyOtp).toHaveBeenCalledWith({ type: 'recovery', token_hash: 'abc123' })
    expect(mockRedirect).toHaveBeenCalledWith('/auth/reset-password')
  })

  it('redirects to / with error when token_hash is missing', async () => {
    await expect(
      GET(makeRequest('http://localhost:3000/auth/confirm?type=recovery')),
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(mockVerifyOtp).not.toHaveBeenCalled()
    expect(mockRedirect).toHaveBeenCalledWith('/?error=invalid_recovery_link')
  })

  it('redirects to / with error when type is missing', async () => {
    await expect(
      GET(makeRequest('http://localhost:3000/auth/confirm?token_hash=abc123')),
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(mockVerifyOtp).not.toHaveBeenCalled()
    expect(mockRedirect).toHaveBeenCalledWith('/?error=invalid_recovery_link')
  })

  it('redirects to / with error when OTP verification fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockVerifyOtp.mockResolvedValue({ error: { message: 'Token expired' } })

    await expect(
      GET(
        makeRequest(
          'http://localhost:3000/auth/confirm?token_hash=expired&type=recovery&next=/auth/reset-password',
        ),
      ),
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/?error=invalid_recovery_link')
    consoleSpy.mockRestore()
  })

  it('handles full URL in next param by extracting pathname', async () => {
    mockVerifyOtp.mockResolvedValue({ error: null })

    await expect(
      GET(
        makeRequest(
          'http://localhost:3000/auth/confirm?token_hash=abc123&type=recovery&next=http://localhost:3000/auth/reset-password',
        ),
      ),
    ).rejects.toThrow('NEXT_REDIRECT:/auth/reset-password')

    expect(mockRedirect).toHaveBeenCalledWith('/auth/reset-password')
  })

  it('defaults next to / when not provided', async () => {
    mockVerifyOtp.mockResolvedValue({ error: null })

    await expect(
      GET(makeRequest('http://localhost:3000/auth/confirm?token_hash=abc123&type=recovery')),
    ).rejects.toThrow('NEXT_REDIRECT:/')

    expect(mockRedirect).toHaveBeenCalledWith('/')
  })

  it('rejects disallowed next paths and falls back to /', async () => {
    mockVerifyOtp.mockResolvedValue({ error: null })

    await expect(
      GET(
        makeRequest(
          'http://localhost:3000/auth/confirm?token_hash=abc123&type=recovery&next=/app/admin',
        ),
      ),
    ).rejects.toThrow('NEXT_REDIRECT:/')

    expect(mockRedirect).toHaveBeenCalledWith('/')
  })
})
