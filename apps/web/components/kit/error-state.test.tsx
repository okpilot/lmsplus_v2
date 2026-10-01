import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ErrorState } from './error-state'

describe('ErrorState', () => {
  it('announces itself as an alert', () => {
    render(<ErrorState />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('shows a default title when none is given', () => {
    render(<ErrorState />)
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
  })

  it('renders a custom title, body and action', () => {
    render(
      <ErrorState title="Could not load" action={<a href="/retry">Retry</a>}>
        Check your connection.
      </ErrorState>,
    )
    expect(screen.getByText('Could not load')).toBeInTheDocument()
    expect(screen.getByText('Check your connection.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Retry' })).toBeInTheDocument()
  })
})
