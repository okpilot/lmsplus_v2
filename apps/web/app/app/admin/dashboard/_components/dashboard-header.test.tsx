import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/app/app/_hooks/use-update-search-params', () => ({
  useUpdateSearchParams: () => vi.fn(),
}))

vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
  SelectValue: () => <span />,
}))

import { DashboardHeader } from './dashboard-header'

describe('DashboardHeader', () => {
  it('renders the page title as a level-1 heading', () => {
    render(<DashboardHeader currentRange="30d" />)
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toHaveClass(
      'text-title',
      'font-semibold',
    )
  })

  it('renders the cohort description', () => {
    render(<DashboardHeader currentRange="30d" />)
    expect(screen.getByText('Instructor overview of your cohort')).toBeInTheDocument()
  })
})
