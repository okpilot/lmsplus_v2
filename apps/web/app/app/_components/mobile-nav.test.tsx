import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  usePathname: () => '/app/dashboard',
}))

import { MobileNav } from './mobile-nav'

describe('MobileNav', () => {
  it('renders a hamburger button', () => {
    render(<MobileNav />)
    expect(screen.getByRole('button', { name: 'Open menu' })).toBeInTheDocument()
  })

  it('shows navigation links when opened', async () => {
    const user = userEvent.setup()
    render(<MobileNav />)

    await user.click(screen.getByRole('button', { name: 'Open menu' }))

    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Smart Review')).toBeInTheDocument()
    expect(screen.getByText('Quiz')).toBeInTheDocument()
    expect(screen.getByText('Progress')).toBeInTheDocument()
  })

  it('closes when close button is clicked', async () => {
    const user = userEvent.setup()
    render(<MobileNav />)

    await user.click(screen.getByRole('button', { name: 'Open menu' }))
    expect(screen.getByRole('button', { name: 'Close menu' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Close menu' }))
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument()
  })
})
