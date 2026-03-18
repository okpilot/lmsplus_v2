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

function makeRequest(url: string) {
  return new NextRequest(url)
}

describe('GET /auth/confirm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('redirects to next param after successful OTP verification', async () => {
    mockVerifyOtp.mockResolvedValue({ error: null })

    const response = await GET(
      makeRequest(
        'http://localhost:3000/auth/confirm?token_hash=abc123&type=recovery&next=/auth/reset-password',
      ),
    )

    expect(mockVerifyOtp).toHaveBeenCalledWith({ type: 'recovery', token_hash: 'abc123' })
    expect(response.status).toBe(307)
    const location = new URL(response.headers.get('location') ?? '')
    expect(location.pathname).toBe('/auth/reset-password')
  })

  it('redirects to / with error when token_hash is missing', async () => {
    const response = await GET(makeRequest('http://localhost:3000/auth/confirm?type=recovery'))

    expect(mockVerifyOtp).not.toHaveBeenCalled()
    expect(response.status).toBe(307)
    const location = new URL(response.headers.get('location') ?? '')
    expect(location.pathname).toBe('/')
    expect(location.searchParams.get('error')).toBe('invalid_recovery_link')
  })

  it('redirects to / with error when type is missing', async () => {
    const response = await GET(makeRequest('http://localhost:3000/auth/confirm?token_hash=abc123'))

    expect(mockVerifyOtp).not.toHaveBeenCalled()
    expect(response.status).toBe(307)
    const location = new URL(response.headers.get('location') ?? '')
    expect(location.pathname).toBe('/')
    expect(location.searchParams.get('error')).toBe('invalid_recovery_link')
  })

  it('redirects to / with error when OTP verification fails', async () => {
    mockVerifyOtp.mockResolvedValue({ error: { message: 'Token expired' } })

    const response = await GET(
      makeRequest(
        'http://localhost:3000/auth/confirm?token_hash=expired&type=recovery&next=/auth/reset-password',
      ),
    )

    expect(response.status).toBe(307)
    const location = new URL(response.headers.get('location') ?? '')
    expect(location.pathname).toBe('/')
    expect(location.searchParams.get('error')).toBe('invalid_recovery_link')
  })

  it('defaults next to / when not provided', async () => {
    mockVerifyOtp.mockResolvedValue({ error: null })

    const response = await GET(
      makeRequest('http://localhost:3000/auth/confirm?token_hash=abc123&type=recovery'),
    )

    expect(response.status).toBe(307)
    const location = new URL(response.headers.get('location') ?? '')
    expect(location.pathname).toBe('/')
  })
})
