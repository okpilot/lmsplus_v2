import { describe, expect, it } from 'vitest'
import { cn } from '../utils'
import { buildTokensCss } from './build-tokens-css'
import { TYPE_ROLES } from './scale'

const css = buildTokensCss()
const mediaBlocks = css.match(/@media \(width >= 64rem\) \{[\s\S]*?\n\}/g) ?? []
const theme = css.slice(css.indexOf('@theme {'))

describe('desktop type step (AC 1)', () => {
  it('has exactly one 64rem media block', () => {
    expect(mediaBlocks).toHaveLength(1)
  })

  it('steps control height and the four small roles down at 64rem', () => {
    const block = mediaBlocks[0] ?? ''
    expect(block).toContain('--control-h: 36px;')
    expect(block).toContain('--text-body: 0.9375rem;')
    expect(block).toContain('--text-label: 0.875rem;')
    expect(block).toContain('--text-caption: 0.8125rem;')
    expect(block).toContain('--text-overline: 0.75rem;')
  })

  it('leaves display, title, heading, stat and line-heights unstepped', () => {
    const block = mediaBlocks[0] ?? ''
    expect(block).not.toMatch(/--text-(title|heading|stat|display)/)
    expect(block).not.toContain('line-height')
  })
})

describe('below-desktop values unchanged (AC 2)', () => {
  it('keeps body 1rem and the fluid label, caption, overline in @theme', () => {
    expect(theme).toContain('--text-body: 1rem;')
    expect(theme).toMatch(/--text-label: clamp\(0\.9375rem, /)
    expect(theme).toMatch(/--text-caption: clamp\(0\.8125rem, /)
    expect(theme).toMatch(/--text-overline: clamp\(0\.75rem, /)
  })
})

describe('default Tailwind sizes cleared (AC 3)', () => {
  it('opens @theme with --text-*: initial before the first role', () => {
    expect(theme.startsWith('@theme {\n  --text-*: initial;')).toBe(true)
    expect(theme.indexOf('--text-*: initial;')).toBeLessThan(theme.indexOf('--text-display:'))
  })
})

describe('micro and chart tokens (AC 4)', () => {
  it('emits micro 11px and chart 9px with sub-variables', () => {
    expect(theme).toContain('--text-micro: 0.6875rem;')
    expect(theme).toContain('--text-micro--line-height: 1.2;')
    expect(theme).toContain('--text-micro--font-weight: 500;')
    expect(theme).toMatch(/--text-micro--letter-spacing: 0(em)?;/)
    expect(theme).toContain('--text-chart: 0.5625rem;')
    expect(theme).toContain('--text-chart--line-height: 1;')
    expect(theme).toContain('--text-chart--font-weight: 400;')
    expect(theme).toMatch(/--text-chart--letter-spacing: 0(em)?;/)
  })

  it('registers micro and chart in TYPE_ROLES', () => {
    expect(Object.keys(TYPE_ROLES)).toEqual(expect.arrayContaining(['micro', 'chart']))
  })

  it('cn merges text-micro with text-caption to the later one', () => {
    expect(cn('text-micro', 'text-caption')).toBe('text-caption')
  })
})

describe('logo tracking token (AC 22)', () => {
  it('declares --tracking-logo: -0.055em in @theme', () => {
    expect(theme).toContain('--tracking-logo: -0.055em;')
  })
})
