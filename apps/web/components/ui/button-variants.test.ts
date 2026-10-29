import { describe, expect, it } from 'vitest'
import { buttonVariants } from './button-variants'

describe('buttonVariants', () => {
  it('applies the primary background by default', () => {
    expect(buttonVariants()).toContain('bg-primary')
  })

  it('applies the border token for the outline variant', () => {
    expect(buttonVariants({ variant: 'outline' })).toContain('border-border')
  })

  it.each(['xs', 'icon-xs', 'lg', 'icon-lg'])('defines no %s size', (size) => {
    const classes = buttonVariants({ size } as unknown as Parameters<typeof buttonVariants>[0])
    expect(classes).toBe(buttonVariants({ size: null }))
  })

  it('sizes sm text with the caption token', () => {
    const sm = buttonVariants({ size: 'sm' })
    expect(sm).toContain('text-caption')
    expect(sm).not.toContain('text-[0.8rem]')
  })

  it.each(['icon', 'icon-sm'] as const)('rounds the %s size fully', (size) => {
    const classes = buttonVariants({ size })
    expect(classes).toContain('rounded-full')
    expect(classes).not.toMatch(/(^|\s)rounded-control(\s|$)/)
  })

  it('fills destructive with the solid destructive pair', () => {
    const classes = buttonVariants({ variant: 'destructive' })
    expect(classes).toContain('bg-destructive')
    expect(classes).toContain('text-destructive-foreground')
    expect(classes).not.toContain('bg-destructive/10')
  })

  it('fills caution with the solid caution pair', () => {
    const classes = buttonVariants({ variant: 'caution' })
    expect(classes).toContain('bg-caution-solid')
    expect(classes).toContain('text-caution-foreground')
  })

  it('styles the toggle variant pressed state', () => {
    const classes = buttonVariants({ variant: 'toggle' })
    expect(classes).toContain('aria-pressed:bg-card')
    expect(classes).toContain('aria-pressed:border-primary')
    expect(classes).toContain('aria-pressed:text-primary-text')
  })

  it('underlines the link variant at rest', () => {
    const tokens = buttonVariants({ variant: 'link' }).split(/\s+/)
    expect(tokens).toContain('underline')
  })
})

describe('buttonVariants state layers', () => {
  it.each([
    ['default', 'primary'],
    ['secondary', 'secondary'],
    ['destructive', 'destructive'],
    ['caution', 'caution-solid'],
  ] as const)('%s fills hover and pressed with the derived state colours', (variant, fill) => {
    const classes = buttonVariants({ variant })
    expect(classes).toContain(`hover:bg-${fill}-hover`)
    expect(classes).toContain(`active:bg-${fill}-pressed`)
    expect(classes).not.toMatch(/hover:bg-[\w-]+\/(80|90)/)
  })

  it('link hover thickens the underline without opacity', () => {
    const classes = buttonVariants({ variant: 'link' })
    expect(classes).not.toContain('hover:opacity-80')
    expect(classes).toContain('hover:decoration-2')
  })
})
