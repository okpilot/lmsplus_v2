import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('./available-tab', () => ({ AvailableTab: () => <div>available content</div> }))
vi.mock('./my-reports-tab', () => ({ MyReportsTab: () => <div>reports content</div> }))

import { InternalExamTabs } from './internal-exam-tabs'

const AVAILABLE = [{ id: 'a' }, { id: 'b' }] as never

describe('InternalExamTabs', () => {
  it('exposes the tab testids and marks the active tab with aria-selected', () => {
    render(<InternalExamTabs available={AVAILABLE} history={[]} />)
    expect(screen.getByRole('tablist')).toBeInTheDocument()
    expect(screen.getByTestId('tab-available')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('tab-reports')).toHaveAttribute('aria-selected', 'false')
  })

  it('shows the reports panel under tabpanel-reports after clicking the reports tab', async () => {
    const user = userEvent.setup()
    render(<InternalExamTabs available={AVAILABLE} history={[]} />)
    await user.click(screen.getByTestId('tab-reports'))
    expect(screen.getByTestId('tab-reports')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('tabpanel-reports')).toBeInTheDocument()
  })

  it('renders the available count as a TabCount with testid tab-available-badge', () => {
    render(<InternalExamTabs available={AVAILABLE} history={[]} />)
    const badge = screen.getByTestId('tab-available-badge')
    expect(badge).toHaveTextContent('2')
    expect(badge).toHaveClass('bg-muted-foreground/15')
  })

  it('styles the active tab with the shared segmented look', () => {
    render(<InternalExamTabs available={AVAILABLE} history={[]} />)
    expect(screen.getByTestId('tab-available')).toHaveClass('data-active:border-primary')
  })
})
