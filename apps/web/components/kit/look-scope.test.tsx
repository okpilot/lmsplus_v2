import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { LookScope } from './look-scope'

describe('LookScope', () => {
  it('marks its wrapper with the redesign look attribute', () => {
    render(<LookScope>content</LookScope>)
    expect(screen.getByText('content')).toHaveAttribute('data-look', 'v2')
  })

  it('renders its children', () => {
    render(
      <LookScope>
        <span>inside</span>
      </LookScope>,
    )
    expect(screen.getByText('inside')).toBeInTheDocument()
  })

  it('merges a custom className with the base classes', () => {
    render(<LookScope className="min-h-screen">content</LookScope>)
    const el = screen.getByText('content')
    expect(el).toHaveClass('min-h-screen')
    expect(el).toHaveClass('bg-canvas')
  })
})
