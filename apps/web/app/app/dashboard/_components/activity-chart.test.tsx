import type { DailyActivity } from '@/lib/queries/analytics'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// Recharts uses SVG APIs not available in jsdom — stub it out entirely.
vi.mock('recharts', () => ({
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="bar-chart">{children}</div>
  ),
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

import { ActivityChart } from './activity-chart'

function makeDay(day: string, correct: number, incorrect: number): DailyActivity {
  return { day, total: correct + incorrect, correct, incorrect }
}

describe('ActivityChart', () => {
  it('shows empty state message when data array is empty', () => {
    render(<ActivityChart data={[]} />)
    expect(screen.getByText('No activity data yet.')).toBeInTheDocument()
  })

  it('renders the bar chart when data is provided', () => {
    const data = [makeDay('2026-03-01', 7, 3), makeDay('2026-03-02', 5, 5)]
    render(<ActivityChart data={data} />)
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument()
  })

  it('renders the "Daily Activity" section heading', () => {
    render(<ActivityChart data={[makeDay('2026-03-01', 7, 3)]} />)
    expect(screen.getByText(/Daily Activity/i)).toBeInTheDocument()
  })
})
