import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockGetUser, mockFrom, mockRedirect } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFrom: vi.fn(),
  mockRedirect: vi.fn(),
}))

vi.mock('@repo/db/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
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

/** Builds a fluent Supabase chain stub that resolves to `returnValue` when awaited. */
function buildChain(returnValue: unknown) {
  const awaitable: Record<string, unknown> = {
    // biome-ignore lint/suspicious/noThenProperty: intentional thenable for Supabase chain mock
    then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(returnValue).then(resolve, reject),
  }
  return new Proxy(awaitable, {
    get(target, prop) {
      if (prop === 'then') return target.then
      return (..._args: unknown[]) => buildChain(returnValue)
    },
  })
}

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

    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u1', email: 'ada@example.com' } },
      error: null,
    })
    mockFrom.mockReturnValue(buildChain({ data: null, error: { message: 'profile read failed' } }))

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
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u1', email: 'ada@example.com' } },
      error: null,
    })
    mockFrom.mockReturnValue(
      buildChain({
        data: { full_name: 'Ada Pilot', email: 'ada@example.com', role: 'instructor' },
        error: null,
      }),
    )

    await renderLayout()

    const shell = screen.getByTestId('app-shell')
    expect(shell.dataset.displayName).toBe('Ada Pilot')
    expect(shell.dataset.userRole).toBe('instructor')
    expect(screen.getByTestId('child')).toBeInTheDocument()
  })

  it('falls back to user.email as displayName when full_name is null', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'u1', email: 'ada@example.com' } },
      error: null,
    })
    mockFrom.mockReturnValue(
      buildChain({
        data: { full_name: null, email: 'ada@example.com', role: 'student' },
        error: null,
      }),
    )

    await renderLayout()

    expect(screen.getByTestId('app-shell').dataset.displayName).toBe('ada@example.com')
  })
})

describe('AppLayout — auth redirect', () => {
  it('calls redirect to / when getUser returns no user', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
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

  it('calls redirect to / when getUser returns an auth error', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'session expired' },
    })
    try {
      await AppLayout({ children: <span /> })
    } catch {
      // redirect may throw internally
    }
    expect(mockRedirect).toHaveBeenCalledWith('/')
  })
})
