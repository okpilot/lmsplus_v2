import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// ---- Mocks ----------------------------------------------------------------

const { mockUsePathname } = vi.hoisted(() => ({
  mockUsePathname: vi.fn<() => string>(),
}))

vi.mock('next/navigation', () => ({
  usePathname: mockUsePathname,
}))

// Child components are layout-only; mock to keep tests fast and isolated
vi.mock('./mobile-nav', () => ({
  MobileNav: () => <div data-testid="mobile-nav" />,
}))
vi.mock('./sidebar-nav', () => ({
  SidebarNav: ({ userRole, displayName }: { userRole?: string; displayName: string }) => (
    <nav
      data-testid="sidebar-nav"
      data-user-role={userRole ?? ''}
      data-display-name={displayName}
    />
  ),
}))
vi.mock('./phone-top-bar', () => ({
  PhoneTopBar: () => <div data-testid="phone-top-bar" />,
}))

// ---- Subject under test ---------------------------------------------------

import { AppShell } from './app-shell'

// ---- Tests ----------------------------------------------------------------

describe('AppShell', () => {
  it('renders the sidebar, phone strip and content when the pathname is not a session route', () => {
    mockUsePathname.mockReturnValue('/app/dashboard')
    render(<AppShell displayName="Ada Pilot">Page content</AppShell>)

    expect(screen.getByTestId('sidebar-nav')).toBeInTheDocument()
    expect(screen.getByTestId('phone-top-bar')).toBeInTheDocument()
    expect(screen.getByText('Page content')).toBeInTheDocument()
  })

  it('renders no top bar landmark on desktop', () => {
    mockUsePathname.mockReturnValue('/app/dashboard')
    render(<AppShell displayName="Ada Pilot">Content</AppShell>)

    expect(screen.queryByRole('banner')).not.toBeInTheDocument()
    expect(screen.queryByRole('main')).not.toBeInTheDocument()
  })

  it('passes the display name and role to the sidebar', () => {
    mockUsePathname.mockReturnValue('/app/dashboard')
    render(
      <AppShell displayName="Ada Pilot" userRole="admin">
        Content
      </AppShell>,
    )

    const sidebar = screen.getByTestId('sidebar-nav')
    expect(sidebar).toHaveAttribute('data-user-role', 'admin')
    expect(sidebar).toHaveAttribute('data-display-name', 'Ada Pilot')
  })

  it('renders the sidebar inside a desktop-only pinned aside', () => {
    mockUsePathname.mockReturnValue('/app/dashboard')
    render(<AppShell displayName="Ada Pilot">Content</AppShell>)

    const aside = screen.getByTestId('sidebar-nav').closest('aside')
    expect(aside?.className).toContain('sticky')
    expect(aside?.className).toContain('hidden')
    expect(within(aside as HTMLElement).getByTestId('sidebar-nav')).toBeInTheDocument()
  })

  it('renders in fullscreen mode when the pathname includes /session', () => {
    mockUsePathname.mockReturnValue('/app/quiz/session')
    render(<AppShell displayName="Ada Pilot">Session content</AppShell>)

    expect(screen.queryByTestId('sidebar-nav')).not.toBeInTheDocument()
    expect(screen.queryByTestId('phone-top-bar')).not.toBeInTheDocument()
    expect(screen.queryByTestId('mobile-nav')).not.toBeInTheDocument()
    expect(screen.getByText('Session content')).toBeInTheDocument()
  })

  it('renders children in both normal and fullscreen modes', () => {
    mockUsePathname.mockReturnValue('/app/dashboard')
    const { rerender } = render(<AppShell displayName="Ada Pilot">Normal child</AppShell>)
    expect(screen.getByText('Normal child')).toBeInTheDocument()

    mockUsePathname.mockReturnValue('/app/quiz/session')
    rerender(<AppShell displayName="Ada Pilot">Session child</AppShell>)
    expect(screen.getByText('Session child')).toBeInTheDocument()
  })

  it('renders the mobile bottom navigation', () => {
    mockUsePathname.mockReturnValue('/app/dashboard')
    render(<AppShell displayName="Ada Pilot">Content</AppShell>)

    expect(screen.getByTestId('mobile-nav')).toBeInTheDocument()
  })

  it('reserves bottom padding on the content area for the mobile bottom bar', () => {
    mockUsePathname.mockReturnValue('/app/dashboard')
    render(<AppShell displayName="Ada Pilot">Content</AppShell>)

    const contentArea = screen.getByText('Content').parentElement
    expect(contentArea?.className).toContain('pb-24')
  })
})
