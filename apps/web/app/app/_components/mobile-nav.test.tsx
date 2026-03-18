import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserProvider } from './user-context'

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

function renderMobileNav() {
  return render(
    <UserProvider displayName="Test" userRole="student">
      <MobileNav />
    </UserProvider>,
  )
}

describe('MobileNav', () => {
  it('renders the bottom tab bar with navigation links', () => {
    renderMobileNav()
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Quiz')).toBeInTheDocument()
    expect(screen.getByText('Reports')).toBeInTheDocument()
  })

  it('highlights the active tab matching the current pathname', () => {
    mockUsePathname.mockReturnValue('/app/quiz')
    renderMobileNav()
    const quizLink = screen.getByText('Quiz').closest('a')
    expect(quizLink?.className).toContain('text-primary')
    const dashboardLink = screen.getByText('Dashboard').closest('a')
    expect(dashboardLink?.className).not.toContain('text-primary')
  })
})
