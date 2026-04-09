import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Hoisted mocks ----------------------------------------------------------

const mockGetDashboardKpis = vi.hoisted(() => vi.fn())
const mockRethrowRedirect = vi.hoisted(() => vi.fn())

// ---- Module mocks -----------------------------------------------------------

vi.mock('../queries', () => ({
  getDashboardKpis: mockGetDashboardKpis,
}))

vi.mock('@/lib/next/rethrow-redirect', () => ({
  rethrowRedirect: mockRethrowRedirect,
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

  it('re-throws redirect errors instead of showing the fallback', async () => {
    const redirectError = new Error('NEXT_REDIRECT:/auth/login')
    mockGetDashboardKpis.mockRejectedValue(redirectError)
    mockRethrowRedirect.mockImplementation((err: unknown) => {
      throw err
    })

    await expect(KpiCardsContent({ range: '30d' })).rejects.toThrow('NEXT_REDIRECT:/auth/login')
  })

  it('passes the range prop to KpiCards', async () => {
    mockGetDashboardKpis.mockResolvedValue({ total: 0, active: 0, avgScore: null, trend: null })

    const element = await KpiCardsContent({ range: '7d' })
    render(element)

    expect(screen.getByTestId('kpi-cards')).toHaveAttribute('data-range', '7d')
  })
})
