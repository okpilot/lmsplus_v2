import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetSessionUser, mockGetCallerProfile } = vi.hoisted(() => ({
  mockGetSessionUser: vi.fn(),
  mockGetCallerProfile: vi.fn(),
}))

vi.mock('@/lib/auth/get-session-user', () => ({
  getSessionUser: () => mockGetSessionUser(),
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
    mockGetSessionUser.mockResolvedValue({ id: 'u1', email: 'ada@example.com' })
    mockGetCallerProfile.mockResolvedValue({
      data: { full_name: 'Ada Pilot', email: 'ada@example.com', role: 'instructor' },
      error: null,
    })

    expect(await loadShellUser()).toEqual({ displayName: 'Ada Pilot', userRole: 'instructor' })
  })

  it('falls back to the profile email when full_name is null', async () => {
    mockGetSessionUser.mockResolvedValue({ id: 'u1', email: 'session@example.com' })
    mockGetCallerProfile.mockResolvedValue({
      data: { full_name: null, email: 'ada@example.com', role: 'student' },
      error: null,
    })

    expect((await loadShellUser())?.displayName).toBe('ada@example.com')
  })

  it('logs the error and falls back to the session email and student role on a DB error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGetSessionUser.mockResolvedValue({ id: 'u1', email: 'ada@example.com' })
    mockGetCallerProfile.mockResolvedValue({
      data: null,
      error: { message: 'profile read failed' },
    })

    expect(await loadShellUser()).toEqual({ displayName: 'ada@example.com', userRole: 'student' })
    expect(consoleSpy).toHaveBeenCalledWith(
      '[AppLayout] profile lookup error:',
      'profile read failed',
    )
  })

  it('logs when the profile row is missing and falls back to student role', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGetSessionUser.mockResolvedValue({ id: 'u1', email: 'ada@example.com' })
    mockGetCallerProfile.mockResolvedValue({ data: null, error: null })

    expect((await loadShellUser())?.userRole).toBe('student')
    expect(consoleSpy).toHaveBeenCalledWith('[AppLayout] profile not found:', 'u1')
  })

  it('falls back to Student when no email is available anywhere', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGetSessionUser.mockResolvedValue({ id: 'u1', email: undefined })
    mockGetCallerProfile.mockResolvedValue({ data: null, error: null })

    expect((await loadShellUser())?.displayName).toBe('Student')
  })

  it('reads the profile for the session user', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGetSessionUser.mockResolvedValue({ id: 'u-session', email: 'ada@example.com' })
    mockGetCallerProfile.mockResolvedValue({ data: null, error: null })

    await loadShellUser()

    expect(mockGetCallerProfile).toHaveBeenCalledWith('u-session')
  })

  it('resolves null without reading the profile when there is no session user', async () => {
    mockGetSessionUser.mockResolvedValue(null)

    expect(await loadShellUser()).toBeNull()
    expect(mockGetCallerProfile).not.toHaveBeenCalled()
  })

  it('resolves null and logs instead of rejecting when a read throws', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGetSessionUser.mockRejectedValue(new Error('boom'))

    await expect(loadShellUser()).resolves.toBeNull()
    expect(consoleSpy).toHaveBeenCalledWith('[loadShellUser] read failed:', 'boom')
  })
})
