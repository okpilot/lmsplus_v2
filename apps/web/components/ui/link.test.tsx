import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Link } from './link'

const has = (el: HTMLElement, t: string) => el.className.split(/\s+/).includes(t)

describe('Link', () => {
  it('renders an anchor with href', () => {
    render(<Link href="/x">go</Link>)
    expect(screen.getByRole('link', { name: 'go' })).toHaveAttribute('href', '/x')
  })

  it.each([
    ['inherit', ['underline', 'underline-offset-4', 'hover:text-primary-text']],
    [
      'muted',
      ['text-muted-foreground', 'underline', 'underline-offset-4', 'hover:text-primary-text'],
    ],
    ['primary', ['text-primary-text', 'underline', 'underline-offset-4']],
  ] as const)('%s tone carries its tokens', (tone, tokens) => {
    render(
      <Link href="/x" tone={tone}>
        go
      </Link>,
    )
    const a = screen.getByRole('link')
    for (const t of tokens) expect(has(a, t), t).toBe(true)
  })

  it('carries the focus ring tokens', () => {
    render(<Link href="/x">go</Link>)
    const a = screen.getByRole('link')
    for (const t of [
      'focus-visible:outline-solid',
      'focus-visible:outline-focus',
      'focus-visible:outline-ring',
      'focus-visible:outline-offset-focus',
    ])
      expect(has(a, t), t).toBe(true)
  })

  it('lets a caller -outline-offset-focus replace the offset', () => {
    render(
      <Link href="/x" className="focus-visible:-outline-offset-focus">
        go
      </Link>,
    )
    const a = screen.getByRole('link')
    expect(has(a, 'focus-visible:-outline-offset-focus')).toBe(true)
    expect(has(a, 'focus-visible:outline-offset-focus')).toBe(false)
  })

  it('forwards target and rel', () => {
    render(
      <Link href="/x" target="_blank" rel="noopener noreferrer">
        go
      </Link>,
    )
    const a = screen.getByRole('link')
    expect(a).toHaveAttribute('target', '_blank')
    expect(a).toHaveAttribute('rel', 'noopener noreferrer')
  })
})
