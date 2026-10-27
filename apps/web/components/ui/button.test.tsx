import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Button } from './button'

describe('Button', () => {
  it('styles the default variant with the action colour pair', () => {
    render(<Button>Start</Button>)
    const button = screen.getByRole('button')
    expect(button.className).toContain('bg-primary')
    expect(button.className).toContain('text-primary-foreground')
  })

  it('passes aria-pressed through to the DOM button', () => {
    render(<Button aria-pressed="true">Toggle</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true')
  })
})
