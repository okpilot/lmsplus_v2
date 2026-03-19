import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from './route'

const { mockGetUser, mockRpcHelper } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockRpcHelper: vi.fn(),
}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: {
      getUser: mockGetUser,
    },
  }),
}))

// The production code calls rpc() from @/lib/supabase-rpc, which is a typed
// wrapper around supabase.rpc(). We mock the wrapper module so we control
// what the route handler actually executes.
vi.mock('@/lib/supabase-rpc', () => ({
  rpc: mockRpcHelper,
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
    expect(mockRpcHelper).not.toHaveBeenCalled()
  })

  it('redirects to /app/dashboard after recording login', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockRpcHelper.mockResolvedValue({ data: null, error: null })

    const response = await GET(makeRequest('http://localhost:3000/auth/login-complete'))

    expect(response.status).toBe(307)
    const location = new URL(response.headers.get('location') ?? '')
    expect(location.pathname).toBe('/app/dashboard')
    expect(mockRpcHelper).toHaveBeenCalledWith(expect.anything(), 'record_login', {})
  })

  it('redirects to /app/dashboard even if record_login fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockRpcHelper.mockResolvedValue({ data: null, error: { message: 'DB connection lost' } })

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
