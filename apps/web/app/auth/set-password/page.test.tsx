import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks --------------------------------------------------------------------

const { mockRequireActiveTempPassword } = vi.hoisted(() => ({
  mockRequireActiveTempPassword: vi.fn(),
}))

vi.mock('@/lib/auth/require-active-temp-password', () => ({
  requireActiveTempPassword: (...args: unknown[]) => mockRequireActiveTempPassword(...args),
}))

vi.mock('./_components/set-password-form', () => ({
  SetPasswordForm: ({ nextPath }: { nextPath: string | null }) => (
    <div data-testid="set-password-form">{nextPath ?? 'no-next'}</div>
  ),
}))

// ---- Subject under test --------------------------------------------------------

import SetPasswordPage from './page'

describe('SetPasswordPage', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('propagates the guard redirect when there is no authenticated user', async () => {
    mockRequireActiveTempPassword.mockRejectedValue(new Error('NEXT_REDIRECT'))

    await expect(SetPasswordPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      'NEXT_REDIRECT',
    )
    expect(mockRequireActiveTempPassword).toHaveBeenCalledWith(null)
  })

  it('passes the safe next path through to the guard', async () => {
    mockRequireActiveTempPassword.mockResolvedValue(undefined)

    await SetPasswordPage({ searchParams: Promise.resolve({ next: '/app/quiz' }) })

    expect(mockRequireActiveTempPassword).toHaveBeenCalledWith('/app/quiz')
  })

  it('renders the set-password form once the guard passes', async () => {
    mockRequireActiveTempPassword.mockResolvedValue(undefined)

    const result = await SetPasswordPage({ searchParams: Promise.resolve({}) })

    expect(result).toBeTruthy()
  })

  it('propagates a guard error to the Server Component error boundary', async () => {
    // Unlike the Server Actions and the proxy gate (which catch and return a
    // generic message / 503), this Server Component follows the code-style.md
    // §6 query-helper pattern: let it throw so app/error.tsx + Sentry see it.
    mockRequireActiveTempPassword.mockRejectedValue(new Error('connection reset'))

    await expect(SetPasswordPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      'connection reset',
    )
  })
})
