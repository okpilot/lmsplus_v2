import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockUsePathname, mockUseSidebar } = vi.hoisted(() => ({
  mockUsePathname: vi.fn<() => string>(),
  mockUseSidebar: vi.fn(() => ({ collapsed: false, toggle: vi.fn(), hydrated: true })),
}))

vi.mock('next/navigation', () => ({
  usePathname: mockUsePathname,
}))

vi.mock('./use-sidebar', () => ({
  useSidebar: mockUseSidebar,
}))

import { SidebarNav } from './sidebar-nav'

beforeEach(() => {
  vi.resetAllMocks()
  mockUsePathname.mockReturnValue('/app/dashboard')
  mockUseSidebar.mockReturnValue({ collapsed: false, toggle: vi.fn(), hydrated: true })
})

describe('SidebarNav', () => {
  it('renders all student navigation links', () => {
    render(<SidebarNav />)
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Quiz')).toBeInTheDocument()
    expect(screen.getByText('Reports')).toBeInTheDocument()
    expect(screen.queryByText('Progress')).not.toBeInTheDocument()
    expect(screen.queryByText('Syllabus')).not.toBeInTheDocument()
  })

  it('shows admin nav items when userRole is admin', () => {
    render(<SidebarNav userRole="admin" />)
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Syllabus')).toBeInTheDocument()
  })

  it('hides admin nav items for student role', () => {
    render(<SidebarNav userRole="student" />)
    expect(screen.queryByText('Syllabus')).not.toBeInTheDocument()
  })

  it('links point to correct routes', () => {
    render(<SidebarNav />)
    expect(screen.getByText('Dashboard').closest('a')).toHaveAttribute('href', '/app/dashboard')
    expect(screen.getByText('Quiz').closest('a')).toHaveAttribute('href', '/app/quiz')
    expect(screen.getByText('Reports').closest('a')).toHaveAttribute('href', '/app/reports')
  })

  it('highlights the active link based on current pathname', () => {
    mockUsePathname.mockReturnValue('/app/quiz')
    render(<SidebarNav />)
    const quizLink = screen.getByText('Quiz').closest('a')
    expect(quizLink?.className).toContain('bg-primary')
  })

  it('highlights parent route when on a sub-path', () => {
    mockUsePathname.mockReturnValue('/app/quiz/session')
    render(<SidebarNav />)
    const quizLink = screen.getByText('Quiz').closest('a')
    expect(quizLink?.className).toContain('bg-primary')
  })

  it('does not highlight non-active links', () => {
    mockUsePathname.mockReturnValue('/app/dashboard')
    render(<SidebarNav />)
    const quizLink = screen.getByText('Quiz').closest('a')
    expect(quizLink?.className).not.toContain('bg-primary')
  })

  it('hides labels when collapsed', () => {
    mockUseSidebar.mockReturnValue({ collapsed: true, toggle: vi.fn(), hydrated: true })
    render(<SidebarNav />)
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument()
    expect(screen.queryByText('Quiz')).not.toBeInTheDocument()
  })

  it('renders collapse toggle button', () => {
    render(<SidebarNav />)
    expect(screen.getByRole('button', { name: 'Collapse sidebar' })).toBeInTheDocument()
  })

  it('calls toggle when collapse button is clicked', async () => {
    const toggle = vi.fn()
    mockUseSidebar.mockReturnValue({ collapsed: false, toggle, hydrated: true })
    const user = userEvent.setup({ delay: null })
    render(<SidebarNav />)

    await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }))

    expect(toggle).toHaveBeenCalledOnce()
  })

  it('shows expand button label when collapsed', () => {
    mockUseSidebar.mockReturnValue({ collapsed: true, toggle: vi.fn(), hydrated: true })
    render(<SidebarNav />)
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument()
  })
})
