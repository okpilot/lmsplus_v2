import { describe, expect, it } from 'vitest'
import { cn } from './utils'

describe('cn', () => {
  it('keeps a text colour next to a design-token text size', () => {
    expect(cn('text-muted-foreground', 'text-caption')).toBe('text-muted-foreground text-caption')
    expect(cn('text-caption', 'text-muted-foreground')).toBe('text-caption text-muted-foreground')
  })

  it('lets a design-token text size replace a default size', () => {
    expect(cn('text-sm', 'text-caption')).toBe('text-caption')
  })

  it('lets a design-token radius replace a default radius', () => {
    expect(cn('rounded-lg', 'rounded-card')).toBe('rounded-card')
  })

  it('lets a design-token spacing replace a default spacing', () => {
    expect(cn('p-4', 'p-card')).toBe('p-card')
  })

  it('lets a design-token container width replace a default width', () => {
    expect(cn('max-w-3xl', 'max-w-content')).toBe('max-w-content')
  })

  it('lets a design-token layer replace a default z-index', () => {
    expect(cn('z-40', 'z-nav')).toBe('z-nav')
  })

  it('lets a design-token duration replace a default duration', () => {
    expect(cn('duration-200', 'duration-fast')).toBe('duration-fast')
  })

  it('treats shadow tokens as shadows', () => {
    expect(cn('shadow-overlay', 'shadow-none')).toBe('shadow-none')
    expect(cn('shadow-raised', 'shadow-black/20')).toBe('shadow-raised shadow-black/20')
  })
})
