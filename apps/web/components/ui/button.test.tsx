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

  it('sizes the default button with the control height', () => {
    render(<Button>Start</Button>)
    expect(screen.getByRole('button').className).toContain('h-(--control-h)')
  })

  it.each([
    ['sm', 'h-7'],
    ['icon-sm', 'size-7'],
    ['segment', 'h-8'],
  ] as const)('keeps the %s button visual size and adds a tap area', (size, visual) => {
    render(<Button size={size}>x</Button>)
    const { className } = screen.getByRole('button')
    expect(className).toContain(visual)
    expect(className).toContain('after:absolute')
    expect(className).toContain('after:-inset-x-0.5')
    expect(className).toContain('after:-inset-y-tap-y')
  })
})
