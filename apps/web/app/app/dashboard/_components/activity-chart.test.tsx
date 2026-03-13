import type { DailyActivity } from '@/lib/queries/analytics'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// Capture the data prop passed to BarChart so we can assert on formatted labels.
let capturedBarChartData: unknown[] = []

// Recharts uses SVG APIs not available in jsdom — stub it out entirely.
vi.mock('recharts', () => ({
  BarChart: ({ children, data }: { children: React.ReactNode; data?: unknown[] }) => {
    capturedBarChartData = data ?? []
    return <div data-testid="bar-chart">{children}</div>
  },
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

  it('formats day strings as UTC dates so timezone offsets never shift the label', () => {
    // 2026-01-01 must render as "1 Jan", not "31 Dec" (which a local-time parse would
    // produce for any timezone west of UTC).
    render(<ActivityChart data={[makeDay('2026-01-01', 3, 1)]} />)
    const formatted = capturedBarChartData as Array<{ label: string }>
    expect(formatted).toHaveLength(1)
    expect(formatted[0]?.label).toBe('1 Jan')
  })

  it('passes original correct and incorrect counts through to the chart data', () => {
    render(<ActivityChart data={[makeDay('2026-03-15', 7, 3)]} />)
    const formatted = capturedBarChartData as Array<{ correct: number; incorrect: number }>
    expect(formatted[0]?.correct).toBe(7)
    expect(formatted[0]?.incorrect).toBe(3)
  })

  it('formats each day in a multi-day dataset independently', () => {
    const data = [makeDay('2026-03-01', 1, 0), makeDay('2026-03-31', 2, 1)]
    render(<ActivityChart data={data} />)
    const formatted = capturedBarChartData as Array<{ label: string }>
    expect(formatted).toHaveLength(2)
    expect(formatted[0]?.label).toBe('1 Mar')
    expect(formatted[1]?.label).toBe('31 Mar')
  })
})
