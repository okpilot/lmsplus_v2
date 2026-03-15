import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/app/dashboard'),
}))

import { usePathname } from 'next/navigation'
import { SidebarNav } from './sidebar-nav'

describe('SidebarNav', () => {
  it('renders all student navigation links', () => {
    render(<SidebarNav />)
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Quiz')).toBeInTheDocument()
    expect(screen.getByText('Progress')).toBeInTheDocument()
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
    expect(screen.getByText('Progress').closest('a')).toHaveAttribute('href', '/app/progress')
  })

  it('highlights the active link based on current pathname', () => {
    vi.mocked(usePathname).mockReturnValue('/app/quiz')
    render(<SidebarNav />)
    const quizLink = screen.getByText('Quiz').closest('a')
    expect(quizLink?.className).toContain('bg-primary')
  })

  it('highlights parent route when on a sub-path', () => {
    vi.mocked(usePathname).mockReturnValue('/app/quiz/session')
    render(<SidebarNav />)
    const quizLink = screen.getByText('Quiz').closest('a')
    expect(quizLink?.className).toContain('bg-primary')
  })

  it('does not highlight non-active links', () => {
    vi.mocked(usePathname).mockReturnValue('/app/dashboard')
    render(<SidebarNav />)
    const quizLink = screen.getByText('Quiz').closest('a')
    expect(quizLink?.className).not.toContain('bg-primary')
  })
})
