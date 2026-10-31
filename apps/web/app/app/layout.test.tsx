import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockLoadShellUser, mockRequireAuthUser } = vi.hoisted(() => ({
  mockLoadShellUser: vi.fn(),
  mockRequireAuthUser: vi.fn(),
}))

vi.mock('@/lib/auth/require-auth-user', () => ({
  requireAuthUser: () => mockRequireAuthUser(),
}))

vi.mock('./_lib/load-shell-user', () => ({
  loadShellUser: (u: unknown) => mockLoadShellUser(u),
}))

vi.mock('./_components/app-shell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-shell">{children}</div>
  ),
}))

vi.mock('./_components/active-user-gate', () => ({ ActiveUserGate: () => null }))
vi.mock('./_components/user-context', () => ({
  UserProvider: ({ user, children }: { user: unknown; children: React.ReactNode }) => (
    <div data-testid="user-provider" data-user-is-promise={String(user instanceof Promise)}>
      {children}
    </div>
  ),
}))

import AppLayout from './layout'

async function renderLayout() {
  render(await AppLayout({ children: <span data-testid="child">page content</span> }))
}

beforeEach(() => {
  vi.clearAllMocks()
  mockLoadShellUser.mockReturnValue(new Promise(() => {}))
  mockRequireAuthUser.mockResolvedValue({ id: 'u1', email: null })
})

describe('AppLayout', () => {
  it('renders the shell and page content without waiting for the user lookup', async () => {
    await renderLayout()

    expect(screen.getByTestId('app-shell')).toBeInTheDocument()
    expect(screen.getByTestId('child')).toBeInTheDocument()
  })

  it('hands the unresolved user lookup to the provider as a promise', async () => {
    await renderLayout()

    expect(screen.getByTestId('user-provider').dataset.userIsPromise).toBe('true')
    expect(mockLoadShellUser).toHaveBeenCalledTimes(1)
    expect(mockLoadShellUser).toHaveBeenCalledWith({ id: 'u1', email: null })
  })

  it('redirects unauthenticated visitors before rendering anything', async () => {
    mockRequireAuthUser.mockRejectedValue(new Error('NEXT_REDIRECT'))

    await expect(AppLayout({ children: <span /> })).rejects.toThrow('NEXT_REDIRECT')
    expect(mockLoadShellUser).not.toHaveBeenCalled()
  })
})
