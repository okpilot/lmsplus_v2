import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Hoisted mocks ----------------------------------------------------------

const mockGetDashboardKpis = vi.hoisted(() => vi.fn())
const mockIsRedirectError = vi.hoisted(() => vi.fn())

// ---- Module mocks -----------------------------------------------------------

vi.mock('../queries', () => ({
  getDashboardKpis: mockGetDashboardKpis,
}))

// Simulate Next.js redirect-error detection — real redirects have a special
// NEXT_REDIRECT digest. Mock lets us control when an error is classified as a
// redirect versus a regular failure.
vi.mock('next/dist/client/components/redirect-error', () => ({
  isRedirectError: mockIsRedirectError,
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
    mockIsRedirectError.mockReturnValue(false)
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
    mockIsRedirectError.mockReturnValue(true)

    await expect(KpiCardsContent({ range: '30d' })).rejects.toThrow('NEXT_REDIRECT:/auth/login')
  })

  it('passes the range prop to KpiCards', async () => {
    mockGetDashboardKpis.mockResolvedValue({ total: 0, active: 0, avgScore: null, trend: null })

    const element = await KpiCardsContent({ range: '7d' })
    render(element)

    expect(screen.getByTestId('kpi-cards')).toHaveAttribute('data-range', '7d')
  })
})
