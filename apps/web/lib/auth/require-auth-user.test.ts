import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetUser = vi.hoisted(() => vi.fn())
const mockRedirect = vi.hoisted(() => vi.fn())
const mockCreateServerSupabaseClient = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
  }),
)

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: mockCreateServerSupabaseClient,
}))

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
}))

import { requireAuthUser } from './require-auth-user'

describe('requireAuthUser', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockCreateServerSupabaseClient.mockResolvedValue({
      auth: { getUser: mockGetUser },
    })
    // next/navigation redirect throws in real Next.js; simulate that so callers stop
    mockRedirect.mockImplementation((path: string) => {
      throw new Error(`NEXT_REDIRECT:${path}`)
    })
  })

  it('returns the authenticated user when a valid session exists', async () => {
    const fakeUser = { id: 'user-abc', email: 'pilot@example.com' }
    mockGetUser.mockResolvedValue({ data: { user: fakeUser }, error: null })

    const result = await requireAuthUser()

    expect(result).toEqual(fakeUser)
  })

  it('redirects to /auth/login when getUser returns an auth error', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'invalid token' },
    })

    await expect(requireAuthUser()).rejects.toThrow('NEXT_REDIRECT:/auth/login')
    expect(mockRedirect).toHaveBeenCalledWith('/auth/login')
  })

  it('redirects to /auth/login when getUser returns null user with no error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })

    await expect(requireAuthUser()).rejects.toThrow('NEXT_REDIRECT:/auth/login')
    expect(mockRedirect).toHaveBeenCalledWith('/auth/login')
  })

  it('redirects to /auth/login exactly once per unauthenticated call', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })

    await expect(requireAuthUser()).rejects.toThrow()
    expect(mockRedirect).toHaveBeenCalledOnce()
  })

  it('does not redirect when the session is valid', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-xyz' } },
      error: null,
    })

    await requireAuthUser()

    expect(mockRedirect).not.toHaveBeenCalled()
  })
})
