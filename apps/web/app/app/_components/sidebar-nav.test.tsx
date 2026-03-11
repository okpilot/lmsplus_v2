import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SidebarNav } from './sidebar-nav'

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/app/dashboard'),
}))

// Re-import to control the mock per test
import { usePathname } from 'next/navigation'

describe('SidebarNav', () => {
  it('renders all four navigation links', () => {
    render(<SidebarNav />)
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Smart Review')).toBeInTheDocument()
    expect(screen.getByText('Quiz')).toBeInTheDocument()
    expect(screen.getByText('Progress')).toBeInTheDocument()
  })

  it('links point to correct routes', () => {
    render(<SidebarNav />)
    expect(screen.getByText('Dashboard').closest('a')).toHaveAttribute('href', '/app/dashboard')
    expect(screen.getByText('Smart Review').closest('a')).toHaveAttribute('href', '/app/review')
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
