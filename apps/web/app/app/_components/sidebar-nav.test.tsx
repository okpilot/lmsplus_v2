import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockUsePathname } = vi.hoisted(() => ({
  mockUsePathname: vi.fn<() => string>(),
}))

vi.mock('next/navigation', () => ({
  usePathname: mockUsePathname,
}))

import { SidebarNav } from './sidebar-nav'

beforeEach(() => {
  vi.resetAllMocks()
  mockUsePathname.mockReturnValue('/app/dashboard')
})

describe('SidebarNav', () => {
  it('renders all student navigation links', () => {
    render(<SidebarNav collapsed={false} onToggle={vi.fn()} />)
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Quiz')).toBeInTheDocument()
    expect(screen.getByText('Reports')).toBeInTheDocument()
    expect(screen.queryByText('Progress')).not.toBeInTheDocument()
    expect(screen.queryByText('Syllabus')).not.toBeInTheDocument()
  })

  it('shows admin nav items when userRole is admin', () => {
    render(<SidebarNav userRole="admin" collapsed={false} onToggle={vi.fn()} />)
    expect(screen.getByText('Syllabus')).toBeInTheDocument()
  })

  it('hides admin nav items for student role', () => {
    render(<SidebarNav userRole="student" collapsed={false} onToggle={vi.fn()} />)
    expect(screen.queryByText('Syllabus')).not.toBeInTheDocument()
  })

  it('links point to correct routes', () => {
    render(<SidebarNav collapsed={false} onToggle={vi.fn()} />)
    expect(screen.getByText('Dashboard').closest('a')).toHaveAttribute('href', '/app/dashboard')
    expect(screen.getByText('Quiz').closest('a')).toHaveAttribute('href', '/app/quiz')
    expect(screen.getByText('Reports').closest('a')).toHaveAttribute('href', '/app/reports')
  })

  it('highlights the active link based on current pathname', () => {
    mockUsePathname.mockReturnValue('/app/quiz')
    render(<SidebarNav collapsed={false} onToggle={vi.fn()} />)
    const quizLink = screen.getByText('Quiz').closest('a')
    expect(quizLink?.className).toContain('bg-primary')
  })

  it('highlights parent route when on a sub-path', () => {
    mockUsePathname.mockReturnValue('/app/quiz/session')
    render(<SidebarNav collapsed={false} onToggle={vi.fn()} />)
    const quizLink = screen.getByText('Quiz').closest('a')
    expect(quizLink?.className).toContain('bg-primary')
  })

  it('does not highlight non-active links', () => {
    mockUsePathname.mockReturnValue('/app/dashboard')
    render(<SidebarNav collapsed={false} onToggle={vi.fn()} />)
    const quizLink = screen.getByText('Quiz').closest('a')
    expect(quizLink?.className).not.toContain('bg-primary')
  })

  it('visually hides labels when collapsed but keeps them for screen readers', () => {
    render(<SidebarNav collapsed={true} onToggle={vi.fn()} />)
    const label = screen.getByText('Dashboard')
    expect(label.className).toContain('sr-only')
  })

  it('renders collapse toggle button', () => {
    render(<SidebarNav collapsed={false} onToggle={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Collapse sidebar' })).toBeInTheDocument()
  })

  it('calls onToggle when collapse button is clicked', async () => {
    const onToggle = vi.fn()
    const user = userEvent.setup({ delay: null })
    render(<SidebarNav collapsed={false} onToggle={onToggle} />)

    await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }))

    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('shows expand button label when collapsed', () => {
    render(<SidebarNav collapsed={true} onToggle={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument()
  })
})
