import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DueReviewsBanner } from './due-reviews-banner'

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

describe('DueReviewsBanner', () => {
  it('shows the "all caught up" message when dueCount is 0', () => {
    render(<DueReviewsBanner dueCount={0} />)
    expect(screen.getByText(/all caught up/i)).toBeInTheDocument()
  })

  it('does not render a link when dueCount is 0', () => {
    render(<DueReviewsBanner dueCount={0} />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('shows singular "review" when dueCount is 1', () => {
    render(<DueReviewsBanner dueCount={1} />)
    expect(screen.getByText('1 review due')).toBeInTheDocument()
  })

  it('shows plural "reviews" when dueCount is greater than 1', () => {
    render(<DueReviewsBanner dueCount={5} />)
    expect(screen.getByText('5 reviews due')).toBeInTheDocument()
  })

  it('links to /app/review when there are due cards', () => {
    render(<DueReviewsBanner dueCount={3} />)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/app/review')
  })

  it('shows the Start Review call-to-action text when reviews are due', () => {
    render(<DueReviewsBanner dueCount={2} />)
    expect(screen.getByText(/start review/i)).toBeInTheDocument()
  })
})
