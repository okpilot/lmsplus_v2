import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Badge } from './badge'

describe('Badge', () => {
  it('keeps the primary look for a plain badge', () => {
    render(<Badge>New</Badge>)
    const el = screen.getByText('New')
    expect(el.className).toContain('bg-primary')
    expect(el.className).toContain('h-5')
    expect(el.className).not.toContain('size-6')
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

  it('lets an explicit variant win over tone', () => {
    render(
      <Badge variant="destructive" tone="success">
        x
      </Badge>,
    )
    const el = screen.getByText('x')
    expect(el.className).toContain('text-destructive')
    expect(el.className).not.toContain('bg-success-soft')
  })

  it('ignores tone classes on non-soft variants', () => {
    render(
      <Badge variant="outline" tone="danger">
        x
      </Badge>,
    )
    expect(screen.getByText('x').className).not.toContain('bg-danger-soft')
  })

  it('renders a circle shape at a fixed square size', () => {
    render(<Badge shape="circle">3</Badge>)
    const el = screen.getByText('3')
    expect(el.className).toContain('size-6')
    expect(el.className).toContain('rounded-full')
  })
})
