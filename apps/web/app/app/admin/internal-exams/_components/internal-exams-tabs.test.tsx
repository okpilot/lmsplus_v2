import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockReplace = vi.hoisted(() => vi.fn())
const mockSearch = vi.hoisted(() => ({ value: '' }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: vi.fn() }),
  usePathname: () => '/app/admin/internal-exams',
  useSearchParams: () => new URLSearchParams(mockSearch.value),
}))
vi.mock('../sittings/_components/sittings-tab', () => ({
  SittingsTab: () => <div>sittings content</div>,
}))
vi.mock('./attempts-table', () => ({ AttemptsTable: () => <div>attempts content</div> }))
vi.mock('./codes-tab', () => ({ CodesTab: () => <div>codes content</div> }))

import { InternalExamsTabs } from './internal-exams-tabs'

function renderTabs() {
  return render(
    <InternalExamsTabs
      students={[]}
      subjects={[]}
      codes={[]}
      codesTotalCount={0}
      attempts={[]}
      attemptsTotalCount={0}
      pageSize={20}
    />,
  )
}

beforeEach(() => {
  mockReplace.mockReset()
  mockSearch.value = ''
})

describe('InternalExamsTabs', () => {
  it('exposes the tab testids and marks the active tab with aria-selected', () => {
    renderTabs()
    expect(screen.getByRole('tablist')).toBeInTheDocument()
    expect(screen.getByTestId('tab-codes')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('tab-attempts')).toHaveAttribute('aria-selected', 'false')
  })

  it('writes the clicked tab to the URL instead of local state', async () => {
    const user = userEvent.setup()
    renderTabs()
    await user.click(screen.getByTestId('tab-attempts'))
    expect(mockReplace).toHaveBeenCalledTimes(1)
    expect(mockReplace.mock.calls[0]?.[0]).toContain('tab=attempts')
  })

  it('navigates again after the URL tab changes (Back, then another tab)', async () => {
    const user = userEvent.setup()
    mockSearch.value = ''
    const view = renderTabs()
    await user.click(screen.getByTestId('tab-attempts'))
    expect(mockReplace).toHaveBeenCalledTimes(1)
    // Back: the URL still says codes, then the user picks attempts again after a different pick.
    await user.click(screen.getByTestId('tab-sittings'))
    expect(mockReplace).toHaveBeenCalledTimes(2)
    mockSearch.value = 'tab=sittings'
    view.rerender(
      <InternalExamsTabs
        students={[]}
        subjects={[]}
        codes={[]}
        codesTotalCount={0}
        attempts={[]}
        attemptsTotalCount={0}
        pageSize={20}
      />,
    )
    await user.click(screen.getByTestId('tab-codes'))
    expect(mockReplace).toHaveBeenCalledTimes(3)
    expect(mockReplace.mock.calls[2]?.[0]).toContain('tab=codes')
  })

  it('selects the attempts tab from ?tab=attempts', () => {
    mockSearch.value = 'tab=attempts'
    renderTabs()
    expect(screen.getByTestId('tab-attempts')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('tabpanel-attempts')).toBeInTheDocument()
  })

  it('selects the sittings tab from ?tab=sittings and lists it last', () => {
    mockSearch.value = 'tab=sittings'
    renderTabs()
    expect(screen.getByTestId('tab-sittings')).toHaveAttribute('aria-selected', 'true')
    const tabs = screen.getAllByRole('tab').map((t) => t.getAttribute('data-testid'))
    expect(tabs).toEqual(['tab-codes', 'tab-attempts', 'tab-sittings'])
  })

  it('styles the active tab with the shared segmented look', () => {
    renderTabs()
    expect(screen.getByTestId('tab-codes')).toHaveClass('data-active:border-primary')
  })
})
