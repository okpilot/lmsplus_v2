import { describe, expect, it } from 'vitest'
import { fluid } from './fluid'

describe('fluid', () => {
  it('scales linearly between the phone and desktop viewport', () => {
    expect(fluid(16, 24)).toBe('clamp(1rem, 0.7955rem + 0.9091vw, 1.5rem)')
  })

  it('returns a plain rem value when min and max are equal', () => {
    expect(fluid(16, 16)).toBe('1rem')
  })

  it('throws a RangeError when min exceeds max', () => {
    expect(() => fluid(24, 16)).toThrow(RangeError)
  })

  it('evaluates to min at 360px and max at 1240px', () => {
    const m = /^clamp\(([\d.]+)rem, ([\d.]+)rem \+ ([\d.]+)vw, ([\d.]+)rem\)$/.exec(fluid(18, 22))
    if (!m) throw new Error('fluid() did not return a clamp() expression')
    const [min, intercept, slope, max] = m.slice(1).map(Number) as [number, number, number, number]
    const at = (vw: number) =>
      Math.min(max * 16, Math.max(min * 16, intercept * 16 + (slope / 100) * vw))
    expect(at(360)).toBeCloseTo(18, 1)
    expect(at(1240)).toBeCloseTo(22, 1)
  })
})
