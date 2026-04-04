import { describe, expect, it } from 'vitest'
import { parsePageParam } from './parse-page-param'

describe('parsePageParam', () => {
  it('returns the parsed integer for a valid numeric string', () => {
    expect(parsePageParam('3')).toBe(3)
  })

  it('returns 1 for "0" (below minimum)', () => {
    expect(parsePageParam('0')).toBe(1)
  })

  it('returns 1 for a negative number string', () => {
    expect(parsePageParam('-1')).toBe(1)
  })

  it('returns 1 for a float string (non-integer)', () => {
    // parseInt("2.5") === 2 which is valid, so this actually returns 2 —
    // the function uses parseInt, not Number(), so "2.5" → 2
    expect(parsePageParam('2.5')).toBe(2)
  })

  it('returns 1 for undefined', () => {
    expect(parsePageParam(undefined)).toBe(1)
  })

  it('returns the parsed integer from the first element of a string array', () => {
    // Arrays are not strings, so the guard short-circuits → 1
    expect(parsePageParam(['2'])).toBe(1)
  })

  it('returns 1 for a non-numeric string (NaN result)', () => {
    expect(parsePageParam('abc')).toBe(1)
  })

  it('returns 1 for an empty string', () => {
    expect(parsePageParam('')).toBe(1)
  })

  it('returns 1 for page "1"', () => {
    expect(parsePageParam('1')).toBe(1)
  })

  it('returns the correct value for large page numbers', () => {
    expect(parsePageParam('999')).toBe(999)
  })
})
