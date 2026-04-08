import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Hoisted mocks ----------------------------------------------------------

const mockGetRecentSessions = vi.hoisted(() => vi.fn())
const mockIsRedirectError = vi.hoisted(() => vi.fn())

// ---- Module mocks -----------------------------------------------------------

vi.mock('../queries', () => ({
  getRecentSessions: mockGetRecentSessions,
}))

vi.mock('next/dist/client/components/redirect-error', () => ({
  isRedirectError: mockIsRedirectError,
}))

vi.mock('./recent-activity-list', () => ({
  RecentActivityList: () => <div data-testid="recent-activity-list" />,
}))

// ---- Subject under test -----------------------------------------------------

import { RecentActivityContent } from './recent-activity-content'

// ---- Tests ------------------------------------------------------------------

describe('RecentActivityContent', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockIsRedirectError.mockReturnValue(false)
  })

  it('renders the activity list when data loads successfully', async () => {
    mockGetRecentSessions.mockResolvedValue([])

    const element = await RecentActivityContent({ range: '30d' })
    render(element)

    expect(screen.getByTestId('recent-activity-list')).toBeInTheDocument()
  })

  it('renders the error fallback when getRecentSessions throws a regular error', async () => {
    mockGetRecentSessions.mockRejectedValue(new Error('connection lost'))

    const element = await RecentActivityContent({ range: '30d' })
    render(element)

    expect(
      screen.getByText('Failed to load recent activity. Please refresh the page.'),
    ).toBeInTheDocument()
  })

  it('re-throws redirect errors instead of showing the fallback', async () => {
    const redirectError = new Error('NEXT_REDIRECT:/auth/login')
    mockGetRecentSessions.mockRejectedValue(redirectError)
    mockIsRedirectError.mockReturnValue(true)

    await expect(RecentActivityContent({ range: '30d' })).rejects.toThrow(
      'NEXT_REDIRECT:/auth/login',
    )
  })
})
