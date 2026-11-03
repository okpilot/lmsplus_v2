import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { cn } from '@/lib/utils'
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
    ['sm', 'h-control-sm', 'after:-inset-y-tap-y'],
    ['icon-sm', 'size-control-sm', 'after:-inset-y-tap-y'],
    ['segment', 'h-control-sm', 'after:-inset-y-tap-y'],
  ] as const)('keeps the %s button visual size and adds a tap area', (size, visual, insetY) => {
    render(<Button size={size}>x</Button>)
    const { className } = screen.getByRole('button')
    expect(className).toContain(visual)
    expect(className).toContain('after:absolute')
    expect(className).toContain('after:-inset-x-0.5')
    expect(className).toContain(insetY)
  })
})

describe('Button variant="bare" (#1676)', () => {
  const BASE_ONLY = [
    'text-label',
    'justify-center',
    'whitespace-nowrap',
    'active:translate-y-px',
    'disabled:opacity-disabled',
    'px-pad-control',
  ]

  it('has the focus-visible outline and none of the base-only tokens', () => {
    render(<Button variant="bare">x</Button>)
    const tokens = screen.getByRole('button').className.split(/\s+/)
    expect(tokens).toContain('focus-visible:outline-focus')
    for (const t of BASE_ONLY) expect(tokens, t).not.toContain(t)
  })

  it('lets a caller -outline-offset-focus replace the offset', () => {
    render(
      <Button variant="bare" className="focus-visible:-outline-offset-focus">
        x
      </Button>,
    )
    const tokens = screen.getByRole('button').className.split(/\s+/)
    expect(tokens.filter((t) => /outline-offset-focus$/.test(t))).toEqual([
      'focus-visible:-outline-offset-focus',
    ])
    expect(cn('focus-visible:outline-offset-focus', 'focus-visible:-outline-offset-focus')).toBe(
      'focus-visible:-outline-offset-focus',
    )
  })

  it('still renders disabled', () => {
    render(
      <Button variant="bare" disabled>
        x
      </Button>,
    )
    expect(screen.getByRole('button')).toBeDisabled()
  })
})
