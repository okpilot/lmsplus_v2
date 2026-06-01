import { describe, expect, it } from 'vitest'
import { clampLimit, DEFAULT_LIMIT, MAX_LIMIT } from './pagination'

describe('clampLimit', () => {
  it('returns DEFAULT_LIMIT when called with no argument', () => {
    expect(clampLimit()).toBe(DEFAULT_LIMIT)
  })

  it('returns DEFAULT_LIMIT when called with undefined', () => {
    expect(clampLimit(undefined)).toBe(DEFAULT_LIMIT)
  })

  it('returns DEFAULT_LIMIT when called with zero', () => {
    expect(clampLimit(0)).toBe(DEFAULT_LIMIT)
  })

  it('returns DEFAULT_LIMIT when called with a negative number', () => {
    expect(clampLimit(-10)).toBe(DEFAULT_LIMIT)
  })

  it('returns DEFAULT_LIMIT when called with a non-number value', () => {
    expect(clampLimit('100' as unknown as number)).toBe(DEFAULT_LIMIT)
  })

  it('returns DEFAULT_LIMIT for NaN instead of leaking NaN downstream', () => {
    expect(clampLimit(Number.NaN)).toBe(DEFAULT_LIMIT)
  })

  it('returns DEFAULT_LIMIT for a non-integer limit', () => {
    expect(clampLimit(25.5)).toBe(DEFAULT_LIMIT)
  })

  it('returns the value unchanged for a valid limit within range', () => {
    expect(clampLimit(25)).toBe(25)
    expect(clampLimit(DEFAULT_LIMIT)).toBe(DEFAULT_LIMIT)
    expect(clampLimit(MAX_LIMIT)).toBe(MAX_LIMIT)
  })

  it('clamps to MAX_LIMIT when the requested limit exceeds it', () => {
    expect(clampLimit(MAX_LIMIT + 1)).toBe(MAX_LIMIT)
    expect(clampLimit(9999)).toBe(MAX_LIMIT)
  })
})
