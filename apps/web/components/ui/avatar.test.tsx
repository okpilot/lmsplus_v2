import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as mod from './avatar'
import { Avatar, AvatarFallback } from './avatar'

describe('Avatar', () => {
  it('exports exactly Avatar, AvatarFallback, AvatarImage', () => {
    expect(Object.keys(mod).sort()).toEqual(['Avatar', 'AvatarFallback', 'AvatarImage'])
  })

  it('marks the root with data-slot="avatar"', () => {
    const { container } = render(
      <Avatar>
        <AvatarFallback>AB</AvatarFallback>
      </Avatar>,
    )
    expect(container.querySelector('[data-slot="avatar"]')).not.toBeNull()
  })

  it('shows the initials in the fallback', () => {
    render(
      <Avatar>
        <AvatarFallback>AB</AvatarFallback>
      </Avatar>,
    )
    expect(screen.getByText('AB')).toBeInTheDocument()
  })

  it('draws a grey circle', () => {
    const { container } = render(
      <Avatar>
        <AvatarFallback>AB</AvatarFallback>
      </Avatar>,
    )
    const cls = (container.querySelector('[data-slot="avatar"]') as HTMLElement).className
    for (const t of ['bg-muted', 'rounded-pill']) expect(cls.split(/\s+/)).toContain(t)
  })

  it('sm is size-avatar and md is size-avatar-md', () => {
    const { container } = render(
      <>
        <Avatar size="sm" data-testid="sm">
          <AvatarFallback>A</AvatarFallback>
        </Avatar>
        <Avatar size="md" data-testid="md">
          <AvatarFallback>B</AvatarFallback>
        </Avatar>
      </>,
    )
    const [sm, md] = Array.from(container.querySelectorAll('[data-slot="avatar"]')).map((e) =>
      e.className.split(/\s+/),
    )
    expect(sm).toContain('size-avatar')
    expect(md).toContain('size-avatar-md')
    expect(md).not.toContain('size-avatar')
  })
})
