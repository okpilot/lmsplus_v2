import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HeatmapContent } from './heatmap-content'

const { mockGetDailyActivity } = vi.hoisted(() => ({
  mockGetDailyActivity: vi.fn(),
}))

vi.mock('@/lib/queries/analytics', () => ({
  getDailyActivity: (...args: unknown[]) => mockGetDailyActivity(...args),
}))

// ActivityHeatmap is a client component — render a minimal stand-in
vi.mock('./activity-heatmap', () => ({
  ActivityHeatmap: ({ data }: { data: { day: string }[] }) => (
    <div data-testid="activity-heatmap" data-count={data.length} />
  ),
}))

describe('HeatmapContent', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('passes fetched activity data to ActivityHeatmap', async () => {
    const fakeData = [
      { day: '2026-01-01', total: 10, correct: 7, incorrect: 3 },
      { day: '2026-01-02', total: 5, correct: 4, incorrect: 1 },
    ]
    mockGetDailyActivity.mockResolvedValue(fakeData)

    const jsx = await HeatmapContent()
    render(jsx)

    expect(screen.getByTestId('activity-heatmap')).toHaveAttribute('data-count', '2')
  })

  it('renders ActivityHeatmap with empty data when getDailyActivity throws', async () => {
    mockGetDailyActivity.mockRejectedValue(new Error('analytics unavailable'))

    const jsx = await HeatmapContent()
    render(jsx)

    expect(screen.getByTestId('activity-heatmap')).toHaveAttribute('data-count', '0')
  })

  it('calls getDailyActivity with 365 days', async () => {
    mockGetDailyActivity.mockResolvedValue([])

    const jsx = await HeatmapContent()
    render(jsx)

    expect(mockGetDailyActivity).toHaveBeenCalledWith(365)
  })
})
