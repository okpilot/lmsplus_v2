import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { SurfaceCard } from './surface-card'

describe('SurfaceCard', () => {
  it('renders a div by default', () => {
    render(<SurfaceCard>card</SurfaceCard>)
    expect(screen.getByText('card').tagName).toBe('DIV')
  })

  it('renders the requested element', () => {
    render(<SurfaceCard as="section">card</SurfaceCard>)
    expect(screen.getByText('card').tagName).toBe('SECTION')
  })

  it('merges a custom className with the surface classes', () => {
    render(<SurfaceCard className="p-6">card</SurfaceCard>)
    const el = screen.getByText('card')
    expect(el).toHaveClass('p-6')
    expect(el).toHaveClass('rounded-3xl')
  })
})
