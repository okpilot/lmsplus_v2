import { describe, expect, it } from 'vitest'
import { mixOklch } from './mix'

describe('mixOklch', () => {
  it('interpolates L and C linearly and keeps the hue toward an achromatic colour', () => {
    expect(mixOklch('oklch(0.5 0.2 258)', 'oklch(0.2 0 0)', 10)).toBe('oklch(0.4700 0.1800 258.00)')
  })

  it('returns the first colour at 0%', () => {
    expect(mixOklch('oklch(0.5 0.2 258)', 'oklch(0.2 0 0)', 0)).toBe('oklch(0.5000 0.2000 258.00)')
  })

  it('returns the second colour L and C at 100%', () => {
    expect(mixOklch('oklch(0.5 0.2 258)', 'oklch(0.2 0 0)', 100)).toMatch(
      /^oklch\(0\.2000 0\.0000 /,
    )
  })

  it('interpolates hue when both colours are chromatic', () => {
    expect(mixOklch('oklch(0.5 0.2 255)', 'oklch(0.3 0.1 260)', 50)).toBe(
      'oklch(0.4000 0.1500 257.50)',
    )
  })
})
