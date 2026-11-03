import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CodeChip } from './code-chip'

describe('CodeChip', () => {
  it('renders a plain grey chip with data-slot code-chip', () => {
    const { container } = render(<CodeChip>010</CodeChip>)
    const el = container.firstElementChild as HTMLElement
    expect(el.getAttribute('data-slot')).toBe('code-chip')
    expect(el).toHaveTextContent('010')
    const cls = el.className.split(/\s+/)
    expect(cls).toContain('bg-muted')
    expect(cls).toContain('text-muted-foreground')
  })
})
