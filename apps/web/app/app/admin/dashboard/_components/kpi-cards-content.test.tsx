import { render, screen } from '@testing-library/react'
import { notFound, redirect } from 'next/navigation'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Hoisted mocks ----------------------------------------------------------

const mockGetDashboardKpis = vi.hoisted(() => vi.fn())
// ---- Module mocks -----------------------------------------------------------

vi.mock('../queries', () => ({
  getDashboardKpis: mockGetDashboardKpis,
}))

// Stub KpiCards — content tests focus on error-handling logic, not card rendering.
vi.mock('./kpi-cards', () => ({
  KpiCards: (props: Record<string, unknown>) => (
    <div data-testid="kpi-cards" data-range={props.range} />
  ),
}))

// ---- Subject under test -----------------------------------------------------

import { KpiCardsContent } from './kpi-cards-content'

// ---- Tests ------------------------------------------------------------------

describe('KpiCardsContent', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders kpi cards when data loads successfully', async () => {
    mockGetDashboardKpis.mockResolvedValue({ total: 5, active: 3, avgScore: 80, trend: 'up' })

    const element = await KpiCardsContent({ range: '30d' })
    render(element)

    expect(screen.getByTestId('kpi-cards')).toBeInTheDocument()
  })

  it('renders the error fallback when getDashboardKpis throws a regular error', async () => {
    mockGetDashboardKpis.mockRejectedValue(new Error('DB timeout'))

    const element = await KpiCardsContent({ range: '30d' })
    render(element)

    expect(screen.getByText('Failed to load KPIs. Please refresh the page.')).toBeInTheDocument()
  })

  it('propagates a redirect() navigation error instead of showing the fallback', async () => {
    const error = capture(() => redirect('/auth/login'))
    mockGetDashboardKpis.mockRejectedValue(error)

    await expect(KpiCardsContent({ range: '30d' })).rejects.toBe(error)
  })

  it('propagates a notFound() navigation error instead of showing the fallback', async () => {
    const error = capture(() => notFound())
    mockGetDashboardKpis.mockRejectedValue(error)

    await expect(KpiCardsContent({ range: '30d' })).rejects.toBe(error)
  })

  it('passes the range prop to KpiCards', async () => {
    mockGetDashboardKpis.mockResolvedValue({ total: 0, active: 0, avgScore: null, trend: null })

    const element = await KpiCardsContent({ range: '7d' })
    render(element)

    expect(screen.getByTestId('kpi-cards')).toHaveAttribute('data-range', '7d')
  })
})

function capture(fn: () => never): unknown {
  try {
    fn()
  } catch (e) {
    return e
  }
  throw new Error('navigation helper did not throw')
}
