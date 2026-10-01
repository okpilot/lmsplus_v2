import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { EmptyState } from './empty-state'

describe('EmptyState', () => {
  it('renders the title, body and action', () => {
    render(
      <EmptyState title="No sessions yet" action={<a href="/start">Start one</a>}>
        Your finished sessions appear here.
      </EmptyState>,
    )
    expect(screen.getByText('No sessions yet')).toBeInTheDocument()
    expect(screen.getByText('Your finished sessions appear here.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Start one' })).toBeInTheDocument()
  })

  it('hides the icon from assistive technology', () => {
    render(<EmptyState title="Empty" icon={<svg data-testid="icon" />} />)
    expect(screen.getByTestId('icon').parentElement).toHaveAttribute('aria-hidden', 'true')
  })
})
