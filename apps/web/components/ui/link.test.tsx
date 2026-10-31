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
