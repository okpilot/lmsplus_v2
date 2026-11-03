import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Skeleton } from './skeleton'

describe('Skeleton', () => {
  it('pulses on the muted surface and is marked with data-slot', () => {
    render(<Skeleton data-testid="s" />)
    const el = screen.getByTestId('s')
    expect(el).toHaveAttribute('data-slot', 'skeleton')
    expect(el.className).toContain('animate-pulse')
    expect(el.className).toContain('bg-muted')
  })

  it('lets a caller radius override the control radius', () => {
    render(<Skeleton data-testid="s" className="rounded-card" />)
    const cls = screen.getByTestId('s').className
    expect(cls).toContain('rounded-card')
    expect(cls).not.toContain('rounded-control')
  })
})
