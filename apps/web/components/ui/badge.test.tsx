import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Badge } from './badge'

describe('Badge', () => {
  it('renders the neutral tone for a bare badge', () => {
    render(<Badge>New</Badge>)
    const el = screen.getByText('New')
    expect(el.className).toContain('bg-muted')
    expect(el.className).toContain('text-muted-foreground')
    expect(el.className).toContain('h-chip')
    expect(el.className).not.toContain('bg-primary')
    expect(el.className).not.toContain('size-avatar')
  })

  it.each([
    ['info', 'bg-info-soft text-info'],
    ['success', 'bg-success-soft text-success'],
    ['caution', 'bg-caution-soft text-caution'],
    ['danger', 'bg-danger-soft text-danger'],
    ['neutral', 'bg-muted text-muted-foreground'],
  ] as const)('applies the soft %s look when only tone is passed', (tone, classes) => {
    render(<Badge tone={tone}>x</Badge>)
    const el = screen.getByText('x')
    for (const c of classes.split(' ')) expect(el.className).toContain(c)
    expect(el.className).not.toContain('bg-primary')
  })

  it('rejects outline on a non-neutral tone at compile time', () => {
    // @ts-expect-error outline exists for the neutral tone only
    const el = <Badge tone="danger" outline />
    expect(el).toBeTruthy()
  })

  it('renders the outline flag with border and transparent fill', () => {
    render(
      <Badge tone="neutral" outline>
        x
      </Badge>,
    )
    const cls = screen.getByText('x').className.split(/\s+/)
    expect(cls).toContain('border-border')
    expect(cls).toContain('bg-transparent')
    expect(cls).toContain('text-muted-foreground')
    expect(cls).not.toContain('bg-muted')
  })

  it('renders a circle shape at a fixed square size', () => {
    render(<Badge shape="circle">3</Badge>)
    const el = screen.getByText('3')
    expect(el.className).toContain('size-avatar')
    expect(el.className).toContain('rounded-pill')
  })

  it('sizes the icon inside a circle badge with the small icon token and no important', () => {
    render(<Badge shape="circle">3</Badge>)
    const cls = screen.getByText('3').className
    expect(cls).toContain('[&>svg]:size-icon-sm')
    expect(cls).not.toMatch(/size-[\w.-]+!/)
  })

  it('has no variant axis, hover states or solid fills', () => {
    render(<Badge>x</Badge>)
    const cls = screen.getByText('x').className
    expect(cls).not.toContain('[a]:hover')
    expect(cls).not.toContain('bg-secondary')
    expect(cls).not.toContain('bg-destructive')
  })
})
