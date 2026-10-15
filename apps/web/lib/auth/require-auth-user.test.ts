import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetSessionUser = vi.hoisted(() => vi.fn())
const mockRedirect = vi.hoisted(() => vi.fn())

vi.mock('@/lib/auth/get-session-user', () => ({
  getSessionUser: () => mockGetSessionUser(),
}))

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
}))

import { requireAuthUser } from './require-auth-user'

describe('requireAuthUser', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    // next/navigation redirect throws in real Next.js; simulate that so callers stop
    mockRedirect.mockImplementation((path: string) => {
      throw new Error(`NEXT_REDIRECT:${path}`)
    })
  })

  it('returns the authenticated user when a valid session exists', async () => {
    const fakeUser = { id: 'user-abc', email: 'pilot@example.com' }
    mockGetSessionUser.mockResolvedValue(fakeUser)

    const result = await requireAuthUser()

    expect(result).toEqual(fakeUser)
  })

  it('redirects to the login page when there is no session user', async () => {
    mockGetSessionUser.mockResolvedValue(null)

    await expect(requireAuthUser()).rejects.toThrow('NEXT_REDIRECT:/')
    expect(mockRedirect).toHaveBeenCalledWith('/')
  })

  it('redirects to the login page exactly once per unauthenticated call', async () => {
    mockGetSessionUser.mockResolvedValue(null)

    await expect(requireAuthUser()).rejects.toThrow()
    expect(mockRedirect).toHaveBeenCalledOnce()
  })

  it('does not redirect when the session is valid', async () => {
    mockGetSessionUser.mockResolvedValue({ id: 'user-xyz', email: null })

    await requireAuthUser()

    expect(mockRedirect).not.toHaveBeenCalled()
  })
})
