import { render, screen } from '@testing-library/react'
import { notFound, redirect } from 'next/navigation'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StudentSessionFilters } from '../../../types'

// ---- Hoisted mocks ----------------------------------------------------------

// ---- Module mocks -----------------------------------------------------------

vi.mock('./session-history-table', () => ({
  SessionHistoryTable: () => <div data-testid="session-history-table" />,
}))

// ---- Subject under test -----------------------------------------------------

import { SessionHistoryContent } from './session-history-content'

// ---- Fixtures ---------------------------------------------------------------

const BASE_FILTERS: StudentSessionFilters = {
  range: 'all',
  page: 1,
  sort: 'date',
  dir: 'desc',
}

// ---- Tests ------------------------------------------------------------------

describe('SessionHistoryContent', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('renders the session history table when data loads successfully', async () => {
    const element = await SessionHistoryContent({
      sessionsPromise: Promise.resolve({ sessions: [], totalCount: 0 }),
      filters: BASE_FILTERS,
    })
    render(element)

    expect(screen.getByTestId('session-history-table')).toBeInTheDocument()
  })

  it('renders the error fallback when the sessions load fails with a regular error', async () => {
    const element = await SessionHistoryContent({
      sessionsPromise: Promise.reject(new Error('network error')),
      filters: BASE_FILTERS,
    })
    render(element)

    expect(
      screen.getByText('Failed to load session history. Please refresh the page.'),
    ).toBeInTheDocument()
  })

  it('propagates a redirect() navigation error instead of showing the fallback', async () => {
    const error = capture(() => redirect('/auth/login'))

    await expect(
      SessionHistoryContent({ sessionsPromise: Promise.reject(error), filters: BASE_FILTERS }),
    ).rejects.toBe(error)
  })

  it('propagates a notFound() navigation error instead of showing the fallback', async () => {
    const error = capture(() => notFound())

    await expect(
      SessionHistoryContent({ sessionsPromise: Promise.reject(error), filters: BASE_FILTERS }),
    ).rejects.toBe(error)
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
