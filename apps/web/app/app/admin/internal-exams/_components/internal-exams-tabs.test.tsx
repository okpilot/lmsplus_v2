import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
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

describe('InternalExamsTabs', () => {
  it('exposes the tab testids and marks the active tab with aria-selected', () => {
    renderTabs()
    expect(screen.getByRole('tablist')).toBeInTheDocument()
    expect(screen.getByTestId('tab-codes')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('tab-attempts')).toHaveAttribute('aria-selected', 'false')
  })

  it('shows the attempts panel under tabpanel-attempts after clicking the attempts tab', async () => {
    const user = userEvent.setup()
    renderTabs()
    await user.click(screen.getByTestId('tab-attempts'))
    expect(screen.getByTestId('tab-attempts')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('tabpanel-attempts')).toBeInTheDocument()
  })

  it('styles the active tab with the shared segmented look', () => {
    renderTabs()
    expect(screen.getByTestId('tab-codes')).toHaveClass('data-active:border-primary')
  })
})
