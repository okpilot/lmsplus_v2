import { describe, expect, it } from 'vitest'
import { contrastRatio, oklchToHex } from './contrast'

describe('contrastRatio', () => {
  it('is 21 for black on white', () => {
    expect(contrastRatio('oklch(0 0 0)', 'oklch(1 0 0)')).toBeCloseTo(21, 1)
  })

  it('is 1 for identical colours', () => {
    expect(contrastRatio('oklch(0.5 0.1 200)', 'oklch(0.5 0.1 200)')).toBeCloseTo(1, 5)
  })

  it('gives the same ratio whichever colour is the foreground', () => {
    const a = contrastRatio('oklch(0.2 0.012 255)', 'oklch(0.963 0.006 255)')
    expect(contrastRatio('oklch(0.963 0.006 255)', 'oklch(0.2 0.012 255)')).toBeCloseTo(a, 8)
  })

  it('measures mid grey on white at 6:1', () => {
    expect(contrastRatio('oklch(0.5 0 0)', 'oklch(1 0 0)')).toBeCloseTo(6, 1)
  })

  it('composites a translucent foreground over the background', () => {
    const solid = contrastRatio('oklch(0 0 0)', 'oklch(1 0 0)')
    const half = contrastRatio('oklch(0 0 0 / 50%)', 'oklch(1 0 0)')
    expect(half).toBeLessThan(solid)
    expect(half).toBeGreaterThan(1)
  })

  it('composites a translucent background over the colour beneath it', () => {
    const overWhite = contrastRatio('oklch(1 0 0)', 'oklch(0 0 0 / 50%)')
    const overBlack = contrastRatio('oklch(1 0 0)', 'oklch(0 0 0 / 50%)', 'oklch(0 0 0)')
    expect(overBlack).toBeCloseTo(21, 1)
    expect(overWhite).toBeLessThan(overBlack)
  })
})

describe('oklchToHex', () => {
  it('throws on a translucent colour', () => {
    expect(() => oklchToHex('oklch(0.5 0.1 200 / 50%)')).toThrow()
  })
})
