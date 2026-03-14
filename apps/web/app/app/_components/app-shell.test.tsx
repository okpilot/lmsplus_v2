import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockUsePathname } = vi.hoisted(() => ({
  mockUsePathname: vi.fn<() => string>(),
}))

vi.mock('next/navigation', () => ({
  usePathname: mockUsePathname,
}))

// Child components are layout-only; mock to keep tests fast and isolated
vi.mock('./mobile-nav', () => ({ MobileNav: () => <div data-testid="mobile-nav" /> }))
vi.mock('./sidebar-nav', () => ({ SidebarNav: () => <nav data-testid="sidebar-nav" /> }))
vi.mock('./sign-out-button', () => ({
  SignOutButton: () => <button type="button">Sign out</button>,
}))
vi.mock('./theme-toggle', () => ({
  ThemeToggle: () => <button type="button">Toggle theme</button>,
}))

// ---- Subject under test ---------------------------------------------------

import { AppShell } from './app-shell'

// ---- Tests ----------------------------------------------------------------

describe('AppShell', () => {
  it('renders the header and sidebar when the pathname is not a session route', () => {
    mockUsePathname.mockReturnValue('/app/dashboard')
    render(<AppShell displayName="Ada Pilot">Page content</AppShell>)

    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByTestId('sidebar-nav')).toBeInTheDocument()
    expect(screen.getByText('Page content')).toBeInTheDocument()
  })

  it('displays the user display name in the header', () => {
    mockUsePathname.mockReturnValue('/app/dashboard')
    render(<AppShell displayName="Ada Pilot">Content</AppShell>)

    expect(screen.getByText('Ada Pilot')).toBeInTheDocument()
  })

  it('renders in fullscreen mode when the pathname includes /session', () => {
    mockUsePathname.mockReturnValue('/app/quiz/session')
    render(<AppShell displayName="Ada Pilot">Session content</AppShell>)

    expect(screen.queryByRole('banner')).not.toBeInTheDocument()
    expect(screen.queryByTestId('sidebar-nav')).not.toBeInTheDocument()
    expect(screen.getByText('Session content')).toBeInTheDocument()
  })

  it('renders the LMS Plus brand name in the header', () => {
    mockUsePathname.mockReturnValue('/app/progress')
    render(<AppShell displayName="Ada Pilot">Content</AppShell>)

    expect(screen.getByText('LMS Plus')).toBeInTheDocument()
  })

  it('renders children in both normal and fullscreen modes', () => {
    mockUsePathname.mockReturnValue('/app/dashboard')
    const { rerender } = render(<AppShell displayName="Ada Pilot">Normal child</AppShell>)
    expect(screen.getByText('Normal child')).toBeInTheDocument()

    mockUsePathname.mockReturnValue('/app/quiz/session')
    rerender(<AppShell displayName="Ada Pilot">Session child</AppShell>)
    expect(screen.getByText('Session child')).toBeInTheDocument()
  })
})
