import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ContentErrorFallback } from './content-error-fallback'

describe('ContentErrorFallback', () => {
  it('shows the message', () => {
    render(<ContentErrorFallback message="Could not load KPIs" />)
    expect(screen.getByText('Could not load KPIs')).toBeInTheDocument()
  })

  it('renders the message as a neutral alert', () => {
    const { container } = render(<ContentErrorFallback message="Could not load KPIs" />)
    expect(container.querySelector('[data-slot="alert"]')).toHaveClass('bg-muted')
  })
})
