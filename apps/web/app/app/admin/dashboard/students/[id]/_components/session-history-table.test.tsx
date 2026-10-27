import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { StudentSessionFilters } from '../../../types'

vi.mock('@/app/app/_components/pagination-bar', () => ({ PaginationBar: () => null }))
vi.mock('@/app/app/_hooks/use-update-search-params', () => ({
  useUpdateSearchParams: () => vi.fn(),
}))
vi.mock('./session-range-header', () => ({ SessionRangeHeader: () => <div /> }))

import { SessionHistoryTable } from './session-history-table'

const FILTERS: StudentSessionFilters = { range: '30d', sort: 'date', dir: 'desc', page: 1 }

describe('SessionHistoryTable', () => {
  it('shows the no-sessions message in the shared empty part', () => {
    const { container } = render(
      <SessionHistoryTable sessions={[]} totalCount={0} filters={FILTERS} />,
    )
    expect(container.querySelector('[data-slot="empty"]')).toHaveTextContent('No sessions found.')
  })

  it('shows the past-last-page message in the shared empty part', () => {
    const { container } = render(
      <SessionHistoryTable sessions={[]} totalCount={40} filters={FILTERS} />,
    )
    expect(container.querySelector('[data-slot="empty"]')).toHaveTextContent(
      'No sessions on this page. Try going back to page 1.',
    )
  })
})
