import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetSessionUser, mockRedirect } = vi.hoisted(() => ({
  mockGetSessionUser: vi.fn(),
  mockRedirect: vi.fn(),
}))

vi.mock('@/lib/auth/get-session-user', () => ({
  getSessionUser: () => mockGetSessionUser(),
}))
vi.mock('next/navigation', () => ({ redirect: mockRedirect }))

import { ShellAuthGuard } from './shell-auth-guard'

beforeEach(() => {
  vi.resetAllMocks()
})

describe('ShellAuthGuard', () => {
  it('redirects to the landing page when there is no session user', async () => {
    mockGetSessionUser.mockResolvedValue(null)

    await ShellAuthGuard()

    expect(mockRedirect).toHaveBeenCalledWith('/')
  })

  it('renders nothing and does not redirect when a session user exists', async () => {
    mockGetSessionUser.mockResolvedValue({ id: 'u1' })

    expect(await ShellAuthGuard()).toBeNull()
    expect(mockRedirect).not.toHaveBeenCalled()
  })
})
