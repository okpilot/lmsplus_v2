import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks --------------------------------------------------------------------

const { mockGetUser, mockVerifySessionUser, mockReadTempPasswordState, mockRedirect, client } =
  vi.hoisted(() => {
    const mockGetUser = vi.fn()
    return {
      mockGetUser,
      client: { auth: { getUser: mockGetUser } },
      mockVerifySessionUser: vi.fn(),
      mockReadTempPasswordState: vi.fn(),
      mockRedirect: vi.fn((_path: string) => {
        throw new Error('NEXT_REDIRECT')
      }),
    }
  })

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => client,
}))

vi.mock('@/lib/auth/verify-session-user', () => ({
  verifySessionUser: mockVerifySessionUser,
}))

vi.mock('@/lib/auth/temp-password', () => ({
  readTempPasswordState: (...args: unknown[]) => mockReadTempPasswordState(...args),
}))

vi.mock('next/navigation', () => ({
  redirect: (path: string) => mockRedirect(path),
}))

// ---- Subject under test --------------------------------------------------------

import { requireActiveTempPassword } from './require-active-temp-password'

// ---- Helpers --------------------------------------------------------------------

const USER_ID = 'aaaaaaaa-0000-4000-a000-000000000004'

function mockAuthenticatedUser() {
  mockVerifySessionUser.mockResolvedValue({ id: USER_ID })
}

describe('requireActiveTempPassword', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockRedirect.mockImplementation((_path: string) => {
      throw new Error('NEXT_REDIRECT')
    })
  })

  it('redirects to / when there is no authenticated user', async () => {
    mockVerifySessionUser.mockResolvedValue(null)

    await expect(requireActiveTempPassword(null)).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/')
  })

  it('reads the temp-password state on the client that verified the session', async () => {
    mockAuthenticatedUser()
    mockReadTempPasswordState.mockResolvedValue('active')

    await requireActiveTempPassword(null)

    expect(mockVerifySessionUser).toHaveBeenCalledWith(client)
    expect(mockReadTempPasswordState).toHaveBeenCalledWith(client, USER_ID)
  })

  it('proceeds to the state check for a verified user whose getUser lookup fails', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error('session missing') })
    mockAuthenticatedUser()
    mockReadTempPasswordState.mockResolvedValue('active')

    await expect(requireActiveTempPassword(null)).resolves.toBeUndefined()

    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('redirects to the given next path when the temp-password state is not active', async () => {
    mockAuthenticatedUser()
    mockReadTempPasswordState.mockResolvedValue('none')

    await expect(requireActiveTempPassword('/app/quiz')).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/app/quiz')
  })

  it('redirects to /app/dashboard when not active and no next path was given', async () => {
    mockAuthenticatedUser()
    mockReadTempPasswordState.mockResolvedValue('expired')

    await expect(requireActiveTempPassword(null)).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/app/dashboard')
  })

  it('resolves without redirecting when the state is active', async () => {
    mockAuthenticatedUser()
    mockReadTempPasswordState.mockResolvedValue('active')

    await expect(requireActiveTempPassword(null)).resolves.toBeUndefined()

    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('propagates a temp-password state read error without redirecting', async () => {
    mockAuthenticatedUser()
    mockReadTempPasswordState.mockRejectedValue(new Error('connection reset'))

    await expect(requireActiveTempPassword(null)).rejects.toThrow('connection reset')
    expect(mockRedirect).not.toHaveBeenCalled()
  })
})
