import { redirect } from 'next/navigation'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetCallerProfile } = vi.hoisted(() => ({
  mockGetCallerProfile: vi.fn(),
}))

vi.mock('@/lib/auth/get-caller-profile', () => ({
  getCallerProfile: (...args: unknown[]) => mockGetCallerProfile(...args),
}))

import { loadShellUser } from './load-shell-user'

beforeEach(() => {
  vi.resetAllMocks()
})

describe('loadShellUser', () => {
  it('returns the profile name and role when the read succeeds', async () => {
    const user = { id: 'u1', email: 'ada@example.com' }
    mockGetCallerProfile.mockResolvedValue({
      data: { full_name: 'Ada Pilot', email: 'ada@example.com', role: 'instructor' },
      error: null,
    })

    expect(await loadShellUser(user)).toEqual({ displayName: 'Ada Pilot', userRole: 'instructor' })
  })

  it('falls back to the profile email when full_name is null', async () => {
    const user = { id: 'u1', email: 'session@example.com' }
    mockGetCallerProfile.mockResolvedValue({
      data: { full_name: null, email: 'ada@example.com', role: 'student' },
      error: null,
    })

    expect((await loadShellUser(user)).displayName).toBe('ada@example.com')
  })

  it('logs the error and falls back to the session email and student role on a DB error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const user = { id: 'u1', email: 'ada@example.com' }
    mockGetCallerProfile.mockResolvedValue({
      data: null,
      error: { message: 'profile read failed' },
    })

    expect(await loadShellUser(user)).toEqual({
      displayName: 'ada@example.com',
      userRole: 'student',
    })
    expect(consoleSpy).toHaveBeenCalledWith(
      '[loadShellUser] profile lookup error:',
      'profile read failed',
    )
  })

  it('redirects to /auth/signout?reason=inactive when the profile row is missing', async () => {
    mockGetCallerProfile.mockResolvedValue({ data: null, error: null })

    await expect(loadShellUser({ id: 'u1', email: 'ada@example.com' })).rejects.toMatchObject({
      digest: expect.stringContaining('NEXT_REDIRECT'),
    })
    await expect(loadShellUser({ id: 'u1', email: 'ada@example.com' })).rejects.toMatchObject({
      digest: expect.stringContaining('/auth/signout?reason=inactive'),
    })
  })

  it('does not redirect on a DB error and keeps the session email fallback', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGetCallerProfile.mockResolvedValue({ data: null, error: { message: 'x' } })

    await expect(loadShellUser({ id: 'u1', email: null })).resolves.toEqual({
      displayName: 'Student',
      userRole: 'student',
    })
  })

  it('reads the profile for the session user', async () => {
    const user = { id: 'u-session', email: 'ada@example.com' }
    mockGetCallerProfile.mockResolvedValue({
      data: { full_name: 'A', email: 'ada@example.com', role: 'student' },
      error: null,
    })

    await loadShellUser(user)

    expect(mockGetCallerProfile).toHaveBeenCalledWith('u-session')
  })

  it('falls back to the session email and logs instead of rejecting when a read throws', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGetCallerProfile.mockRejectedValue(new Error('boom'))

    await expect(loadShellUser({ id: 'u1', email: 'ada@example.com' })).resolves.toEqual({
      displayName: 'ada@example.com',
      userRole: 'student',
    })
    expect(consoleSpy).toHaveBeenCalledWith('[loadShellUser] read failed:', 'boom')
  })

  it('lets a Next redirect thrown by the read propagate instead of falling back', async () => {
    mockGetCallerProfile.mockImplementation(() => redirect('/login'))

    await expect(loadShellUser({ id: 'u1', email: 'ada@example.com' })).rejects.toMatchObject({
      digest: expect.stringContaining('NEXT_REDIRECT'),
    })
  })
})
