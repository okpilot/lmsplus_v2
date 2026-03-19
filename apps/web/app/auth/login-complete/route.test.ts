import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from './route'

const mockGetUser = vi.fn()
const mockRpc = vi.fn()

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: {
      getUser: mockGetUser,
    },
    rpc: mockRpc,
  }),
}))

function makeRequest(url: string) {
  return new NextRequest(url)
}

describe('GET /auth/login-complete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('redirects to login when no session exists', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    const response = await GET(makeRequest('http://localhost:3000/auth/login-complete'))

    expect(response.status).toBe(307)
    const location = new URL(response.headers.get('location') ?? '')
    expect(location.pathname).toBe('/')
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('redirects to /app/dashboard after recording login', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockRpc.mockResolvedValue({ data: null, error: null })

    const response = await GET(makeRequest('http://localhost:3000/auth/login-complete'))

    expect(response.status).toBe(307)
    const location = new URL(response.headers.get('location') ?? '')
    expect(location.pathname).toBe('/app/dashboard')
    expect(mockRpc).toHaveBeenCalledWith('record_login', {})
  })

  it('redirects to /app/dashboard even if record_login fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockRpc.mockResolvedValue({ data: null, error: { message: 'DB connection lost' } })

    const response = await GET(makeRequest('http://localhost:3000/auth/login-complete'))

    expect(response.status).toBe(307)
    const location = new URL(response.headers.get('location') ?? '')
    expect(location.pathname).toBe('/app/dashboard')
    expect(consoleSpy).toHaveBeenCalledWith(
      '[login-complete] record_login RPC failed:',
      'DB connection lost',
    )
    consoleSpy.mockRestore()
  })
})
