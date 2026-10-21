import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ShellUser } from '../_lib/load-shell-user'
import { UserProvider } from './user-context'

const fulfilled = <T,>(v: T) =>
  Object.assign(Promise.resolve(v), { status: 'fulfilled' as const, value: v })

const { mockUsePathname } = vi.hoisted(() => ({
  mockUsePathname: vi.fn<() => string>(),
}))

vi.mock('next/navigation', () => ({
  usePathname: mockUsePathname,
}))

import { MobileNav } from './mobile-nav'

beforeEach(() => {
  vi.resetAllMocks()
  mockUsePathname.mockReturnValue('/app/dashboard')
})

function renderMobileNav(
  user: Promise<ShellUser | null> = fulfilled({ displayName: 'Test', userRole: 'student' }),
) {
  return render(
    <UserProvider user={user}>
      <MobileNav />
    </UserProvider>,
  )
}

describe('MobileNav', () => {
  it('renders the bottom tab bar with navigation links', () => {
    renderMobileNav()
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Quiz')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'More' })).toBeInTheDocument()
  })

  it('highlights the active tab matching the current pathname', () => {
    mockUsePathname.mockReturnValue('/app/quiz')
    renderMobileNav()
    const quizLink = screen.getByText('Quiz').closest('a')
    expect(quizLink).toHaveAttribute('aria-current', 'page')
    const dashboardLink = screen.getByText('Dashboard').closest('a')
    expect(dashboardLink).not.toHaveAttribute('aria-current')
  })

  it('shows the generic tab bar while the user is still loading', () => {
    renderMobileNav(new Promise(() => {}))
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Bottom navigation' })).toBeInTheDocument()
  })

  it('adds the admin tab for admins once the user has resolved', () => {
    mockUsePathname.mockReturnValue('/app/admin/students')
    renderMobileNav(fulfilled({ displayName: 'Test', userRole: 'admin' }))
    expect(screen.getByRole('navigation', { name: 'Bottom navigation' })).toBeInTheDocument()
  })
})
