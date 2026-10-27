import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { UserProvider } from '@/app/app/_components/user-context'
import type { ShellUser } from '@/app/app/_lib/shell-user'
import { DashboardHeader } from './dashboard-header'

const fulfilled = <T,>(v: T) =>
  Object.assign(Promise.resolve(v), { status: 'fulfilled' as const, value: v })

function renderWithUser(user: Promise<ShellUser>) {
  return render(
    <UserProvider user={user}>
      <DashboardHeader />
    </UserProvider>,
  )
}

const ada = fulfilled({ displayName: 'Oleksandr Pilot', userRole: 'student' })

describe('DashboardHeader', () => {
  it('renders the Dashboard heading', () => {
    renderWithUser(ada)
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
  })

  it('shows the welcome greeting with the first name once the user has resolved', () => {
    const { container } = renderWithUser(ada)
    expect(container.querySelector('p')?.textContent).toBe('Welcome back, Oleksandr')
  })

  it('ignores leading whitespace when picking the first name', () => {
    const { container } = renderWithUser(
      fulfilled({ displayName: '  Jane Doe', userRole: 'student' }),
    )
    expect(container.querySelector('p')?.textContent).toBe('Welcome back, Jane')
  })

  it('shows a generic greeting while the user is still loading', () => {
    const { container } = renderWithUser(new Promise(() => {}))
    expect(container.querySelector('p')?.textContent).toBe('Welcome back')
  })

  it('shows a generic greeting when the display name is blank', () => {
    const { container } = renderWithUser(fulfilled({ displayName: '   ', userRole: 'student' }))
    expect(container.querySelector('p')?.textContent).toBe('Welcome back')
  })

  it('renders the Start Quiz link pointing to /app/quiz', () => {
    renderWithUser(ada)
    expect(screen.getByRole('link', { name: /start quiz/i })).toHaveAttribute('href', '/app/quiz')
  })

  it('renders the page title as the shared level-1 header with the quiz link beside it', () => {
    renderWithUser(ada)
    const heading = screen.getByRole('heading', { level: 1, name: 'Dashboard' })
    expect(heading).toHaveClass('text-title')
    expect(heading.parentElement?.parentElement).toContainElement(
      screen.getByRole('link', { name: '+ Start Quiz' }),
    )
  })
})
