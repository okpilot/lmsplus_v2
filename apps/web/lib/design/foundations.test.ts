import { describe, expect, it } from 'vitest'
import { buildTokensCss } from './build-tokens-css'
import { COLOURS, CONTRAST_PAIRS } from './colour'
import { contrastRatio } from './contrast'
import { mixOklch } from './mix'
import { ELEVATION, SCRIM } from './scale'

const STATE_DARK = 'oklch(0.2 0 0)'
type Palette = Record<string, string>

describe('elevation and scrim tokens', () => {
  const css = buildTokensCss()
  const [lightPart, darkPart] = css.split('.dark {')

  it('declares elevation and scrim in :root', () => {
    expect(lightPart).toContain('--elevation-raised: 0 4px 12px oklch(0 0 0 / 8%);')
    expect(lightPart).toContain('--elevation-overlay: 0 12px 32px oklch(0 0 0 / 14%);')
    expect(lightPart).toContain('--scrim: oklch(0 0 0 / 40%);')
  })

  it('deepens elevation in .dark', () => {
    expect(darkPart).toContain('--elevation-raised: 0 4px 12px oklch(0 0 0 / 40%);')
    expect(darkPart).toContain('--elevation-overlay: 0 12px 32px oklch(0 0 0 / 50%);')
  })

  it('maps shadow and scrim utilities in the theme', () => {
    expect(css).toContain('--shadow-raised: var(--elevation-raised);')
    expect(css).toContain('--shadow-overlay: var(--elevation-overlay);')
    expect(css).toContain('--color-scrim: var(--scrim);')
  })

  it('makes the default transition the fast duration with the standard ease', () => {
    expect(css).toContain('--default-transition-duration: var(--transition-duration-fast);')
    expect(css).toContain('--default-transition-timing-function: var(--ease-standard);')
  })

  it('pins the scale constants', () => {
    expect(ELEVATION).toEqual({
      raised: { y: 4, blur: 12, light: 8, dark: 40 },
      overlay: { y: 12, blur: 32, light: 14, dark: 50 },
    })
    expect(SCRIM).toEqual({ light: 40, dark: 40 })
  })
})

describe('derived state colours', () => {
  const fills = ['primary', 'secondary', 'destructive', 'caution-solid'] as const
  for (const theme of ['light', 'dark'] as const) {
    const p = COLOURS[theme] as Palette
    for (const fill of fills) {
      const overlay = fill === 'secondary' ? (p.foreground as string) : STATE_DARK
      it(`${theme} ${fill}-hover and -pressed mix 8% and 12% of the overlay`, () => {
        expect(p[`${fill}-hover`]).toBe(mixOklch(p[fill] as string, overlay, 8))
        expect(p[`${fill}-pressed`]).toBe(mixOklch(p[fill] as string, overlay, 12))
      })
    }
    for (const fill of ['primary', 'destructive', 'caution-solid'] as const) {
      it(`${theme} ${fill}-hover and -pressed keep the fill's hue`, () => {
        const hue = (c: unknown) => Number(String(c).split(/[\s)]+/)[2])
        expect(hue(p[`${fill}-hover`])).toBeCloseTo(hue(p[fill]), 1)
        expect(hue(p[`${fill}-pressed`])).toBeCloseTo(hue(p[fill]), 1)
      })
    }
  }

  it('checks each on-colour against its hover and pressed fill', () => {
    const pairs = CONTRAST_PAIRS as ReadonlyArray<readonly [string, string, number]>
    const on = {
      primary: 'primary',
      destructive: 'destructive',
      'caution-solid': 'caution',
      secondary: 'secondary',
    }
    for (const [fill, name] of Object.entries(on)) {
      for (const state of ['hover', 'pressed']) {
        const hit = pairs.find(([f, b]) => f === `${name}-foreground` && b === `${fill}-${state}`)
        expect(hit, `${name}-foreground on ${fill}-${state}`).toBeDefined()
        expect(hit?.[2]).toBe(4.5)
      }
    }
  })
})

describe('meter contrast on the track', () => {
  it('darkens the light meter fills', () => {
    expect(COLOURS.light.data).toBe('oklch(0.61 0.009 255)')
    expect(COLOURS.light['data-goal']).toBe('oklch(0.59 0.15 150)')
  })

  for (const name of ['data', 'data-goal'] as const) {
    it(`${name} is a 3:1 pair on muted and clears it in both themes`, () => {
      const pairs = CONTRAST_PAIRS as ReadonlyArray<readonly [string, string, number]>
      expect(pairs.some(([f, b, m]) => f === name && b === 'muted' && m === 3)).toBe(true)
      for (const theme of ['light', 'dark'] as const) {
        const p = COLOURS[theme] as Palette
        expect(contrastRatio(p[name] as string, p.muted as string)).toBeGreaterThanOrEqual(3)
      }
    })
  }
})
