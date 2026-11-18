import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PendingNoticesBanner } from './pending-notices-banner'

describe('PendingNoticesBanner', () => {
  it('renders nothing when no notice is pending', () => {
    const { container } = render(<PendingNoticesBanner count={0} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('states the plural copy with the count and no Send button', () => {
    render(<PendingNoticesBanner count={3} />)
    expect(
      screen.getByText(
        '3 students removed because they passed will be notified once email sending is available.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('uses the singular for one student', () => {
    render(<PendingNoticesBanner count={1} />)
    expect(
      screen.getByText(
        '1 student removed because they passed will be notified once email sending is available.',
      ),
    ).toBeInTheDocument()
  })
})
