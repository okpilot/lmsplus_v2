import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserProvider } from './user-context'

const { mockUsePathname } = vi.hoisted(() => ({
  mockUsePathname: vi.fn<() => string>(),
}))

vi.mock('next/navigation', () => ({
  usePathname: mockUsePathname,
}))

import { BottomTabBar } from './bottom-tab-bar'

function renderTabBar(userRole = 'student') {
  return render(
    <UserProvider displayName="Test User" userRole={userRole}>
      <BottomTabBar />
    </UserProvider>,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  mockUsePathname.mockReturnValue('/app/dashboard')
})

describe('BottomTabBar', () => {
  it('renders 3 navigation tabs for students', () => {
    renderTabBar()
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Quiz')).toBeInTheDocument()
    expect(screen.getByText('Reports')).toBeInTheDocument()
    expect(screen.queryByText('Syllabus')).not.toBeInTheDocument()
  })

  it('shows admin items for admin users', () => {
    renderTabBar('admin')
    expect(screen.getByText('Syllabus')).toBeInTheDocument()
  })

  it('highlights the active tab matching the current pathname', () => {
    mockUsePathname.mockReturnValue('/app/quiz')
    renderTabBar()
    const quizLink = screen.getByText('Quiz').closest('a')
    expect(quizLink?.className).toContain('text-primary')
    const dashboardLink = screen.getByText('Dashboard').closest('a')
    expect(dashboardLink?.className).not.toContain('text-primary')
  })

  it('highlights parent tab when on a sub-path', () => {
    mockUsePathname.mockReturnValue('/app/quiz/session')
    renderTabBar()
    const quizLink = screen.getByText('Quiz').closest('a')
    expect(quizLink?.className).toContain('text-primary')
  })

  it('links point to correct routes', () => {
    renderTabBar()
    expect(screen.getByText('Dashboard').closest('a')).toHaveAttribute('href', '/app/dashboard')
    expect(screen.getByText('Quiz').closest('a')).toHaveAttribute('href', '/app/quiz')
    expect(screen.getByText('Reports').closest('a')).toHaveAttribute('href', '/app/reports')
  })

  it('renders the Internal Exam tab for students', () => {
    renderTabBar()
    expect(screen.getByText('Internal Exam')).toBeInTheDocument()
  })

  it('links Internal Exam tab to the correct route', () => {
    renderTabBar()
    expect(screen.getByText('Internal Exam').closest('a')).toHaveAttribute(
      'href',
      '/app/internal-exam',
    )
  })
})
