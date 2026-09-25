import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks --------------------------------------------------------------------

const { mockGetUser, mockReadTempPasswordState, mockRedirect } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockReadTempPasswordState: vi.fn(),
  mockRedirect: vi.fn((_path: string) => {
    throw new Error('NEXT_REDIRECT')
  }),
}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({ auth: { getUser: mockGetUser } }),
}))

vi.mock('@/lib/auth/temp-password', () => ({
  readTempPasswordState: (...args: unknown[]) => mockReadTempPasswordState(...args),
}))

vi.mock('next/navigation', () => ({
  redirect: (path: string) => mockRedirect(path),
}))

vi.mock('./_components/set-password-form', () => ({
  SetPasswordForm: ({ nextPath }: { nextPath: string | null }) => (
    <div data-testid="set-password-form">{nextPath ?? 'no-next'}</div>
  ),
}))

// ---- Subject under test --------------------------------------------------------

import SetPasswordPage from './page'

// ---- Helpers --------------------------------------------------------------------

const USER_ID = 'aaaaaaaa-0000-4000-a000-000000000004'

function mockAuthenticatedUser() {
  mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null })
}

describe('SetPasswordPage', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockRedirect.mockImplementation((_path: string) => {
      throw new Error('NEXT_REDIRECT')
    })
  })

  it('redirects to / when there is no authenticated user', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })

    await expect(SetPasswordPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      'NEXT_REDIRECT',
    )

    expect(mockRedirect).toHaveBeenCalledWith('/')
  })

  it('redirects to the next path when the temp-password state is not active', async () => {
    mockAuthenticatedUser()
    mockReadTempPasswordState.mockResolvedValue('none')

    await expect(
      SetPasswordPage({ searchParams: Promise.resolve({ next: '/app/quiz' }) }),
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/app/quiz')
  })

  it('redirects to /app/dashboard when not active and no next path was given', async () => {
    mockAuthenticatedUser()
    mockReadTempPasswordState.mockResolvedValue('expired')

    await expect(SetPasswordPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      'NEXT_REDIRECT',
    )

    expect(mockRedirect).toHaveBeenCalledWith('/app/dashboard')
  })

  it('renders the set-password form when the state is active', async () => {
    mockAuthenticatedUser()
    mockReadTempPasswordState.mockResolvedValue('active')

    const result = await SetPasswordPage({ searchParams: Promise.resolve({}) })

    expect(mockRedirect).not.toHaveBeenCalled()
    expect(result).toBeTruthy()
  })

  it('propagates a temp-password state read error to the Server Component error boundary', async () => {
    // Unlike the Server Actions and the proxy gate (which catch and return a
    // generic message / 503), this Server Component follows the code-style.md
    // §6 query-helper pattern: let it throw so app/error.tsx + Sentry see it.
    mockAuthenticatedUser()
    mockReadTempPasswordState.mockRejectedValue(new Error('connection reset'))

    await expect(SetPasswordPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      'connection reset',
    )
    expect(mockRedirect).not.toHaveBeenCalled()
  })
})
