import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockLoadShellUser } = vi.hoisted(() => ({
  mockLoadShellUser: vi.fn(),
}))

vi.mock('./_lib/load-shell-user', () => ({
  loadShellUser: () => mockLoadShellUser(),
}))

vi.mock('./_components/shell-auth-guard', () => ({
  ShellAuthGuard: () => <div data-testid="auth-guard" />,
}))

vi.mock('./_components/app-shell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-shell">{children}</div>
  ),
}))

vi.mock('./_components/user-context', () => ({
  UserProvider: ({ user, children }: { user: unknown; children: React.ReactNode }) => (
    <div data-testid="user-provider" data-user-is-promise={String(user instanceof Promise)}>
      {children}
    </div>
  ),
}))

import AppLayout from './layout'

function renderLayout() {
  render(AppLayout({ children: <span data-testid="child">page content</span> }))
}

beforeEach(() => {
  vi.clearAllMocks()
  mockLoadShellUser.mockReturnValue(new Promise(() => {}))
})

describe('AppLayout', () => {
  it('renders the shell and page content without waiting for the user lookup', () => {
    renderLayout()

    expect(screen.getByTestId('app-shell')).toBeInTheDocument()
    expect(screen.getByTestId('child')).toBeInTheDocument()
  })

  it('hands the unresolved user lookup to the provider as a promise', () => {
    renderLayout()

    expect(screen.getByTestId('user-provider').dataset.userIsPromise).toBe('true')
    expect(mockLoadShellUser).toHaveBeenCalledTimes(1)
  })

  it('renders the auth guard alongside the shell', () => {
    renderLayout()

    expect(screen.getByTestId('auth-guard')).toBeInTheDocument()
  })
})

describe('AppLayout — redesign look scope', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('renders the shell inside the v2 look scope when the redesign look is on', () => {
    vi.stubEnv('NEXT_PUBLIC_REDESIGN_LOOK', 'on')
    renderLayout()
    expect(screen.getByTestId('app-shell').closest('[data-look]')).toHaveAttribute(
      'data-look',
      'v2',
    )
  })

  it('renders the shell without the v2 look when the redesign look is unset', () => {
    vi.stubEnv('NEXT_PUBLIC_REDESIGN_LOOK', '')
    renderLayout()
    expect(screen.getByTestId('app-shell').closest('[data-look]')).toBeNull()
  })
})
