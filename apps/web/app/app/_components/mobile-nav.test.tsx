import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockUsePathname } = vi.hoisted(() => ({
  mockUsePathname: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  usePathname: mockUsePathname,
}))

import { MobileNav } from './mobile-nav'

beforeEach(() => {
  vi.resetAllMocks()
  mockUsePathname.mockReturnValue('/app/dashboard')
})

describe('MobileNav', () => {
  it('renders a hamburger button', () => {
    render(<MobileNav />)
    expect(screen.getByRole('button', { name: 'Open menu' })).toBeInTheDocument()
  })

  it('shows navigation links when opened', async () => {
    const user = userEvent.setup({ delay: null })
    render(<MobileNav />)

    await user.click(screen.getByRole('button', { name: 'Open menu' }))

    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Quiz')).toBeInTheDocument()
    expect(screen.getByText('Progress')).toBeInTheDocument()
    expect(screen.queryByText('Smart Review')).not.toBeInTheDocument()
  })

  it('closes when close button is clicked', async () => {
    const user = userEvent.setup({ delay: null })
    render(<MobileNav />)

    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    expect(screen.getByRole('button', { name: 'Close menu' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Close menu' }))
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument()
  })

  it('highlights the active navigation link matching the current pathname', async () => {
    mockUsePathname.mockReturnValue('/app/quiz')
    const user = userEvent.setup({ delay: null })
    render(<MobileNav />)

    await user.click(screen.getByRole('button', { name: 'Open menu' }))

    const quizLink = screen.getByText('Quiz')
    expect(quizLink.className).toContain('bg-primary/10')

    const dashboardLink = screen.getByText('Dashboard')
    expect(dashboardLink.className).not.toContain('bg-primary/10')
  })

  it('highlights the link when pathname is a sub-route', async () => {
    mockUsePathname.mockReturnValue('/app/quiz/session')
    const user = userEvent.setup({ delay: null })
    render(<MobileNav />)

    await user.click(screen.getByRole('button', { name: 'Open menu' }))

    const quizLink = screen.getByText('Quiz')
    expect(quizLink.className).toContain('bg-primary/10')

    const progressLink = screen.getByText('Progress')
    expect(progressLink.className).not.toContain('bg-primary/10')
  })
})
