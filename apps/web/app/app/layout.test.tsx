import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockGetSessionUser, mockGetCallerProfile, mockRedirect } = vi.hoisted(() => ({
  mockGetSessionUser: vi.fn(),
  mockGetCallerProfile: vi.fn(),
  mockRedirect: vi.fn(),
}))

vi.mock('@/lib/auth/get-session-user', () => ({
  getSessionUser: () => mockGetSessionUser(),
}))

vi.mock('@/lib/auth/get-caller-profile', () => ({
  getCallerProfile: (...args: unknown[]) => mockGetCallerProfile(...args),
}))

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
}))

// Child components are 'use client' shells — mock to keep tests fast and isolated.
vi.mock('./_components/app-shell', () => ({
  AppShell: ({
    displayName,
    userRole,
    children,
  }: {
    displayName: string
    userRole?: string
    children: React.ReactNode
  }) => (
    <div data-testid="app-shell" data-display-name={displayName} data-user-role={userRole ?? ''}>
      {children}
    </div>
  ),
}))

vi.mock('./_components/user-context', () => ({
  UserProvider: ({
    displayName,
    userRole,
    children,
  }: {
    displayName: string
    userRole?: string
    children: React.ReactNode
  }) => (
    <div
      data-testid="user-provider"
      data-display-name={displayName}
      data-user-role={userRole ?? ''}
    >
      {children}
    </div>
  ),
}))

// ---- Subject under test ---------------------------------------------------

import AppLayout from './layout'

// ---- Helpers --------------------------------------------------------------

async function renderLayout() {
  const jsx = await AppLayout({ children: <span data-testid="child">page content</span> })
  render(jsx)
}

// ---- Tests ----------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  // Default: redirect is a no-op (we don't throw here — it's mocked)
  mockRedirect.mockReturnValue(undefined)
})

describe('AppLayout — profile error fallback', () => {
  it('logs the error and falls back to student role when the profile read returns a DB error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    mockGetSessionUser.mockResolvedValue({ id: 'u1', email: 'ada@example.com' })
    mockGetCallerProfile.mockResolvedValue({
      data: null,
      error: { message: 'profile read failed' },
    })

    await renderLayout()

    expect(consoleSpy).toHaveBeenCalledWith(
      '[AppLayout] profile lookup error:',
      'profile read failed',
    )

    const shell = screen.getByTestId('app-shell')
    expect(shell.dataset.userRole).toBe('student')
    // displayName falls back to user.email when profile is null
    expect(shell.dataset.displayName).toBe('ada@example.com')

    consoleSpy.mockRestore()
  })
})

describe('AppLayout — happy path', () => {
  it('renders with displayName and userRole from the profile when the read succeeds', async () => {
    mockGetSessionUser.mockResolvedValue({ id: 'u1', email: 'ada@example.com' })
    mockGetCallerProfile.mockResolvedValue({
      data: { full_name: 'Ada Pilot', email: 'ada@example.com', role: 'instructor' },
      error: null,
    })

    await renderLayout()

    const shell = screen.getByTestId('app-shell')
    expect(shell.dataset.displayName).toBe('Ada Pilot')
    expect(shell.dataset.userRole).toBe('instructor')
    expect(screen.getByTestId('child')).toBeInTheDocument()
  })

  it('falls back to user.email as displayName when full_name is null', async () => {
    mockGetSessionUser.mockResolvedValue({ id: 'u1', email: 'ada@example.com' })
    mockGetCallerProfile.mockResolvedValue({
      data: { full_name: null, email: 'ada@example.com', role: 'student' },
      error: null,
    })

    await renderLayout()

    expect(screen.getByTestId('app-shell').dataset.displayName).toBe('ada@example.com')
  })
})

describe('AppLayout — profile lookup', () => {
  it('logs when the profile row is missing and falls back to student role', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGetSessionUser.mockResolvedValue({ id: 'u1', email: 'ada@example.com' })
    mockGetCallerProfile.mockResolvedValue({ data: null, error: null })

    await renderLayout()

    expect(consoleSpy).toHaveBeenCalledWith('[AppLayout] profile not found:', 'u1')
    expect(screen.getByTestId('app-shell').dataset.userRole).toBe('student')
    consoleSpy.mockRestore()
  })

  it('reads the profile for the session user', async () => {
    mockGetSessionUser.mockResolvedValue({ id: 'u-session', email: 'ada@example.com' })
    mockGetCallerProfile.mockResolvedValue({ data: null, error: null })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await renderLayout()

    expect(mockGetCallerProfile).toHaveBeenCalledWith('u-session')
    consoleSpy.mockRestore()
  })
})

describe('AppLayout — auth redirect', () => {
  it('calls redirect to / when there is no session user', async () => {
    mockGetSessionUser.mockResolvedValue(null)
    // redirect is mocked as a no-op; the component will call it and then continue.
    // We cannot render the JSX after the redirect call because it never returns
    // in real Next.js — the mock allows us to assert the redirect call was made.
    try {
      await AppLayout({ children: <span /> })
    } catch {
      // If redirect throws (e.g. isRedirectError), that's acceptable — still assert the call.
    }
    expect(mockRedirect).toHaveBeenCalledWith('/')
  })
})

describe('AppLayout — redesign look scope', () => {
  async function renderForRole() {
    mockGetSessionUser.mockResolvedValue({ id: 'u1', email: 'ada@example.com' })
    mockGetCallerProfile.mockResolvedValue({
      data: { full_name: 'Ada Pilot', email: 'ada@example.com', role: 'student' },
      error: null,
    })
    await renderLayout()
    return screen.getByTestId('app-shell').closest('[data-look]')
  }

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('renders the shell inside the v2 look scope when the redesign look is on', async () => {
    vi.stubEnv('NEXT_PUBLIC_REDESIGN_LOOK', 'on')
    const scope = await renderForRole()
    expect(scope).toHaveAttribute('data-look', 'v2')
  })

  it('renders the shell without the v2 look when the redesign look is unset', async () => {
    vi.stubEnv('NEXT_PUBLIC_REDESIGN_LOOK', '')
    expect(await renderForRole()).toBeNull()
  })
})
