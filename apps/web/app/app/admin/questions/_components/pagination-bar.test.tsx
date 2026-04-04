import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mocks -----------------------------------------------------------------

const mockRouterReplace = vi.fn()
const mockSearchParamsToString = vi.fn().mockReturnValue('')

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockRouterReplace }),
  useSearchParams: () => ({ toString: mockSearchParamsToString }),
}))

// lucide-react icons are SVG — stub them to avoid SVG transform issues in jsdom
vi.mock('lucide-react', () => ({
  ChevronLeft: () => <span data-testid="icon-chevron-left" />,
  ChevronRight: () => <span data-testid="icon-chevron-right" />,
}))

// ---- Subject under test ----------------------------------------------------

import { buildPageItems, buildPageNumbers, PaginationBar } from './pagination-bar'

// ---- Tests: buildPageNumbers -----------------------------------------------

describe('buildPageNumbers', () => {
  it('returns all pages when total is 9 or less', () => {
    expect(buildPageNumbers(1, 5)).toEqual([1, 2, 3, 4, 5])
    expect(buildPageNumbers(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(buildPageNumbers(5, 9)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('returns single page for total 1', () => {
    expect(buildPageNumbers(1, 1)).toEqual([1])
  })

  it('shows ellipsis after page 1 when current is far from start', () => {
    const pages = buildPageNumbers(5, 10)
    expect(pages[0]).toBe(1)
    expect(pages[1]).toBe('...')
  })

  it('shows ellipsis before last page when current is far from end', () => {
    const pages = buildPageNumbers(5, 10)
    expect(pages[pages.length - 1]).toBe(10)
    expect(pages[pages.length - 2]).toBe('...')
  })

  it('shows current page and its neighbors in the middle', () => {
    const pages = buildPageNumbers(5, 10)
    expect(pages).toContain(4)
    expect(pages).toContain(5)
    expect(pages).toContain(6)
  })

  it('does not show leading ellipsis when current is near start', () => {
    const pages = buildPageNumbers(2, 10)
    expect(pages).toEqual([1, 2, 3, 4, '...', 10])
  })

  it('does not show trailing ellipsis when current is near end', () => {
    const pages = buildPageNumbers(9, 10)
    expect(pages).toEqual([1, '...', 7, 8, 9, 10])
  })

  it('does not show leading ellipsis when current is exactly at threshold (4)', () => {
    // current=4 → current > 4 is false, so no leading ellipsis
    const pages = buildPageNumbers(4, 10)
    expect(pages).toEqual([1, 2, 3, 4, 5, 6, '...', 10])
  })

  it('shows leading ellipsis when current is one past the threshold (5)', () => {
    // current=5 → current > 4 is true, so leading ellipsis appears
    const pages = buildPageNumbers(5, 10)
    expect(pages).toEqual([1, '...', 3, 4, 5, 6, 7, '...', 10])
  })

  it('does not show trailing ellipsis when current is exactly at threshold (total - 3)', () => {
    // current=7, total=10 → current < total-3 = 7 is false, so no trailing ellipsis
    const pages = buildPageNumbers(7, 10)
    expect(pages).toEqual([1, '...', 5, 6, 7, 8, 9, 10])
  })

  it('shows both ellipses when current is in the middle of a large set', () => {
    const pages = buildPageNumbers(10, 20)
    expect(pages).toEqual([1, '...', 8, 9, 10, 11, 12, '...', 20])
  })

  it('handles current at page 1 of a large set', () => {
    // current=1, no leading ellipsis; window starts at 1, end=3; trailing ellipsis appears
    const pages = buildPageNumbers(1, 20)
    expect(pages).toEqual([1, 2, 3, '...', 20])
  })

  it('handles current at last page of a large set', () => {
    // current=20, leading ellipsis appears; window ends at 19; no trailing ellipsis
    const pages = buildPageNumbers(20, 20)
    expect(pages).toEqual([1, '...', 18, 19, 20])
  })
})

// ---- Tests: buildPageItems -------------------------------------------------

describe('buildPageItems', () => {
  it('returns page items for each number', () => {
    const items = buildPageItems(1, 3)
    expect(items).toEqual([
      { type: 'page', page: 1 },
      { type: 'page', page: 2 },
      { type: 'page', page: 3 },
    ])
  })

  it('returns ellipsis items for ... entries', () => {
    const items = buildPageItems(10, 20)
    const ellipsisItems = items.filter((i) => i.type === 'ellipsis')
    expect(ellipsisItems).toHaveLength(2)
  })

  it('assigns unique keys to multiple ellipsis items', () => {
    const items = buildPageItems(10, 20)
    const ellipsisItems = items.filter((i) => i.type === 'ellipsis')
    const keys = ellipsisItems.map((i) => (i as { type: 'ellipsis'; key: string }).key)
    expect(new Set(keys).size).toBe(ellipsisItems.length)
  })

  it('assigns sequential ellipsis keys starting from ellipsis-1', () => {
    const items = buildPageItems(10, 20)
    const ellipsisItems = items.filter((i) => i.type === 'ellipsis') as Array<{
      type: 'ellipsis'
      key: string
    }>
    expect(ellipsisItems[0]?.key).toBe('ellipsis-1')
    expect(ellipsisItems[1]?.key).toBe('ellipsis-2')
  })

  it('returns only page items when total pages is 9 or fewer', () => {
    const items = buildPageItems(1, 5)
    expect(items.every((i) => i.type === 'page')).toBe(true)
    expect(items).toHaveLength(5)
  })
})

// ---- Tests: PaginationBar component ----------------------------------------

describe('PaginationBar', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockSearchParamsToString.mockReturnValue('')
  })

  it('renders null when totalCount is 0', () => {
    const { container } = render(<PaginationBar page={1} totalCount={0} pageSize={25} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders null when all results fit on one page', () => {
    const { container } = render(<PaginationBar page={1} totalCount={25} pageSize={25} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders null when totalCount is less than pageSize', () => {
    const { container } = render(<PaginationBar page={1} totalCount={10} pageSize={25} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders when there is more than one page', () => {
    render(<PaginationBar page={1} totalCount={50} pageSize={25} />)
    expect(screen.getByLabelText('Previous page')).toBeInTheDocument()
    expect(screen.getByLabelText('Next page')).toBeInTheDocument()
  })

  it('shows "Showing X–Y of Z questions" text for page 1', () => {
    render(<PaginationBar page={1} totalCount={50} pageSize={25} />)
    expect(screen.getByText('Showing 1–25 of 50 questions')).toBeInTheDocument()
  })

  it('shows correct range text for page 2', () => {
    render(<PaginationBar page={2} totalCount={50} pageSize={25} />)
    expect(screen.getByText('Showing 26–50 of 50 questions')).toBeInTheDocument()
  })

  it('caps "to" value at totalCount on the last partial page', () => {
    render(<PaginationBar page={2} totalCount={40} pageSize={25} />)
    expect(screen.getByText('Showing 26–40 of 40 questions')).toBeInTheDocument()
  })

  it('disables the Previous button on page 1', () => {
    render(<PaginationBar page={1} totalCount={50} pageSize={25} />)
    expect(screen.getByLabelText('Previous page')).toBeDisabled()
  })

  it('enables the Previous button on page 2', () => {
    render(<PaginationBar page={2} totalCount={50} pageSize={25} />)
    expect(screen.getByLabelText('Previous page')).not.toBeDisabled()
  })

  it('disables the Next button on the last page', () => {
    render(<PaginationBar page={2} totalCount={50} pageSize={25} />)
    expect(screen.getByLabelText('Next page')).toBeDisabled()
  })

  it('enables the Next button when not on the last page', () => {
    render(<PaginationBar page={1} totalCount={75} pageSize={25} />)
    expect(screen.getByLabelText('Next page')).not.toBeDisabled()
  })

  it('navigates to next page when Next button is clicked', async () => {
    const user = userEvent.setup()
    render(<PaginationBar page={1} totalCount={75} pageSize={25} />)

    await user.click(screen.getByLabelText('Next page'))

    expect(mockRouterReplace).toHaveBeenCalledWith('?page=2')
  })

  it('navigates to previous page when Previous button is clicked', async () => {
    const user = userEvent.setup()
    render(<PaginationBar page={3} totalCount={75} pageSize={25} />)

    await user.click(screen.getByLabelText('Previous page'))

    expect(mockRouterReplace).toHaveBeenCalledWith('?page=2')
  })

  it('navigates to a specific page when a numbered button is clicked', async () => {
    const user = userEvent.setup()
    render(<PaginationBar page={1} totalCount={75} pageSize={25} />)

    await user.click(screen.getByRole('button', { name: '2' }))

    expect(mockRouterReplace).toHaveBeenCalledWith('?page=2')
  })

  it('removes the page param from the URL when navigating to page 1', async () => {
    const user = userEvent.setup()
    mockSearchParamsToString.mockReturnValue('page=2')
    render(<PaginationBar page={2} totalCount={75} pageSize={25} />)

    await user.click(screen.getByLabelText('Previous page'))

    // page=1 is represented by no ?page param
    expect(mockRouterReplace).toHaveBeenCalledWith('?')
  })

  it('preserves existing search params when navigating', async () => {
    const user = userEvent.setup()
    mockSearchParamsToString.mockReturnValue('subjectId=abc')
    render(<PaginationBar page={1} totalCount={75} pageSize={25} />)

    await user.click(screen.getByLabelText('Next page'))

    expect(mockRouterReplace).toHaveBeenCalledWith('?subjectId=abc&page=2')
  })

  it('renders with out-of-range page (server redirects in practice)', () => {
    // In production, QuestionsContent redirects out-of-range pages server-side.
    // If the component receives page > totalPages, it renders based on raw page.
    render(<PaginationBar page={99} totalCount={50} pageSize={25} />)
    // Component still renders — server redirect prevents this in practice
    expect(screen.getByLabelText('Previous page')).toBeInTheDocument()
  })

  it('renders page number buttons for each page in a small set', () => {
    render(<PaginationBar page={1} totalCount={75} pageSize={25} />)
    expect(screen.getByRole('button', { name: '1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '3' })).toBeInTheDocument()
  })

  it('renders ellipsis spans when total pages exceeds 9', () => {
    // 11 pages → ellipsis should appear
    render(<PaginationBar page={4} totalCount={275} pageSize={25} />)
    const ellipses = screen.getAllByText('...')
    expect(ellipses.length).toBeGreaterThan(0)
  })
})
