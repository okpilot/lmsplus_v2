import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Button } from './button'

describe('Button', () => {
  it('styles the brand variant with the brand colour pair', () => {
    render(<Button variant="brand">Start</Button>)
    const button = screen.getByRole('button')
    expect(button.className).toContain('bg-brand')
    expect(button.className).toContain('text-brand-foreground')
  })

  it('leaves the default variant free of brand colours', () => {
    render(<Button>Start</Button>)
    expect(screen.getByRole('button').className).not.toContain('bg-brand')
  })

  it('passes aria-pressed through to the DOM button', () => {
    render(<Button aria-pressed="true">Toggle</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true')
  })
})
