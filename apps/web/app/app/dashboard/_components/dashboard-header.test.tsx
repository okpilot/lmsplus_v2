import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserProvider } from '@/app/app/_components/user-context'
import { DashboardHeader } from './dashboard-header'

function renderWithUser(displayName = 'Oleksandr Pilot') {
  return render(
    <UserProvider displayName={displayName}>
      <DashboardHeader />
    </UserProvider>,
  )
}

describe('DashboardHeader', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders the Dashboard heading', () => {
    renderWithUser()
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
  })

  it('shows the welcome greeting with the first name', () => {
    renderWithUser('Oleksandr Pilot')
    expect(screen.getByText('Welcome back, Oleksandr')).toBeInTheDocument()
  })

  it('renders the Start Quiz link pointing to /app/quiz', () => {
    renderWithUser()
    const link = screen.getByRole('link', { name: /start quiz/i })
    expect(link).toHaveAttribute('href', '/app/quiz')
  })
})
