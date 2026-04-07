import { describe, expect, it } from 'vitest'
import { getMasteryColor } from './constants'

describe('getMasteryColor', () => {
  it('returns red for values below 50', () => {
    expect(getMasteryColor(0)).toBe('text-red-600')
    expect(getMasteryColor(49)).toBe('text-red-600')
  })

  it('returns amber for values between 50 and 79', () => {
    expect(getMasteryColor(50)).toBe('text-amber-600')
    expect(getMasteryColor(79)).toBe('text-amber-600')
  })

  it('returns green for values 80 and above', () => {
    expect(getMasteryColor(80)).toBe('text-green-600')
    expect(getMasteryColor(100)).toBe('text-green-600')
  })
})
