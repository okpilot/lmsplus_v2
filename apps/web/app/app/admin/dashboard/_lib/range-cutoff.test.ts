import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { rangeToCutoff, rangeToDays } from './range-cutoff'

describe('rangeToDays', () => {
  it('maps 7d to 7', () => expect(rangeToDays('7d')).toBe(7))
  it('maps 30d to 30', () => expect(rangeToDays('30d')).toBe(30))
  it('maps 90d to 90', () => expect(rangeToDays('90d')).toBe(90))
  it('maps all to 0', () => expect(rangeToDays('all')).toBe(0))
})

describe('rangeToCutoff', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-07T12:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns null for "all"', () => {
    expect(rangeToCutoff('all')).toBeNull()
  })

  it('returns ISO string 7 days ago for "7d"', () => {
    const result = rangeToCutoff('7d')
    expect(result).toBe(new Date('2026-03-31T12:00:00.000Z').toISOString())
  })

  it('returns ISO string 30 days ago for "30d"', () => {
    const result = rangeToCutoff('30d')
    expect(result).not.toBeNull()
    // setDate subtracts calendar days, so verify the local date is 30 days earlier
    const resultDate = new Date(result!)
    expect(resultDate.getFullYear()).toBe(2026)
    expect(resultDate.getMonth()).toBe(2) // March = 2
    expect(resultDate.getDate()).toBe(8)
  })
})
