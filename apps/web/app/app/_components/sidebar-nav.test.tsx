import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockUsePathname } = vi.hoisted(() => ({
  mockUsePathname: vi.fn<() => string>(),
}))

vi.mock('next/navigation', () => ({
  usePathname: mockUsePathname,
}))

vi.mock('./sidebar-footer', () => ({
  SidebarFooter: ({ displayName }: { displayName: string }) => (
    <div data-testid="sidebar-footer">{displayName}</div>
  ),
}))

import { SidebarNav } from './sidebar-nav'

function renderNav(props: { userRole?: string } = {}) {
  render(<SidebarNav displayName="Ada Pilot" {...props} />)
  return screen.getByRole('navigation', { name: 'Main navigation' })
}

beforeEach(() => {
  vi.resetAllMocks()
  mockUsePathname.mockReturnValue('/app/dashboard')
})

describe('SidebarNav', () => {
  it('renders the wordmark home link', () => {
    renderNav()
    expect(screen.getByRole('link', { name: 'lmsplus home' })).toHaveAttribute(
      'href',
      '/app/dashboard',
    )
  })

  it('renders the Learn and Progress groups with their links', () => {
    const nav = renderNav()
    expect(within(nav).getByText('Learn')).toBeInTheDocument()
    expect(within(nav).getByText('Progress')).toBeInTheDocument()
    for (const label of ['Dashboard', 'Quiz', 'VFR RT', 'Internal Exam', 'Reports']) {
      expect(within(nav).getByRole('link', { name: label })).toBeInTheDocument()
    }
  })

  it('keeps Settings out of the main groups', () => {
    const nav = renderNav()
    expect(within(nav).queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument()
  })

  it('links point to correct routes', () => {
    const nav = renderNav()
    expect(within(nav).getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'href',
      '/app/dashboard',
    )
    expect(within(nav).getByRole('link', { name: 'Quiz' })).toHaveAttribute('href', '/app/quiz')
    expect(within(nav).getByRole('link', { name: 'Reports' })).toHaveAttribute(
      'href',
      '/app/reports',
    )
    expect(within(nav).getByRole('link', { name: 'Internal Exam' })).toHaveAttribute(
      'href',
      '/app/internal-exam',
    )
  })

  it('marks the link matching the current pathname as the current page', () => {
    mockUsePathname.mockReturnValue('/app/quiz')
    const nav = renderNav()
    expect(within(nav).getByRole('link', { name: 'Quiz' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current')
  })

  it('marks the parent link as current when on a sub-path', () => {
    mockUsePathname.mockReturnValue('/app/quiz/session')
    const nav = renderNav()
    expect(within(nav).getByRole('link', { name: 'Quiz' })).toHaveAttribute('aria-current', 'page')
  })

  it('shows the Admin group with its links for admins', () => {
    const nav = renderNav({ userRole: 'admin' })
    expect(within(nav).getByText('Admin')).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Students' })).toHaveAttribute(
      'href',
      '/app/admin/students',
    )
    expect(within(nav).getByRole('link', { name: 'Questions' })).toHaveAttribute(
      'href',
      '/app/admin/questions',
    )
    expect(within(nav).getByRole('link', { name: 'Internal Exams' })).toHaveAttribute(
      'href',
      '/app/admin/internal-exams',
    )
  })

  it('hides the Admin group for students', () => {
    const nav = renderNav({ userRole: 'student' })
    expect(within(nav).queryByText('Admin')).not.toBeInTheDocument()
    expect(within(nav).queryByRole('link', { name: 'Students' })).not.toBeInTheDocument()
  })

  it('renders the footer with the display name', () => {
    renderNav()
    expect(screen.getByTestId('sidebar-footer')).toHaveTextContent('Ada Pilot')
  })

  it('has no collapse control', () => {
    renderNav()
    expect(screen.queryByRole('button', { name: /collapse|expand/i })).not.toBeInTheDocument()
  })
})
