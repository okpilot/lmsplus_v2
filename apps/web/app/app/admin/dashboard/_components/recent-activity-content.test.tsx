import { render, screen } from '@testing-library/react'
import { notFound, redirect } from 'next/navigation'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Hoisted mocks ----------------------------------------------------------

const mockGetRecentSessions = vi.hoisted(() => vi.fn())
// ---- Module mocks -----------------------------------------------------------

vi.mock('../queries', () => ({
  getRecentSessions: mockGetRecentSessions,
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

  it('propagates a redirect() navigation error instead of showing the fallback', async () => {
    const error = capture(() => redirect('/auth/login'))
    mockGetRecentSessions.mockRejectedValue(error)

    await expect(RecentActivityContent({ range: '30d' })).rejects.toBe(error)
  })

  it('propagates a notFound() navigation error instead of showing the fallback', async () => {
    const error = capture(() => notFound())
    mockGetRecentSessions.mockRejectedValue(error)

    await expect(RecentActivityContent({ range: '30d' })).rejects.toBe(error)
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
