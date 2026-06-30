import { describe, expect, it } from 'vitest'
import { clampPage } from './pagination'

describe('clampPage', () => {
  it('returns 1 when called with no argument', () => {
    expect(clampPage()).toBe(1)
  })

  it('returns 1 when called with undefined', () => {
    expect(clampPage(undefined)).toBe(1)
  })

  it('returns 1 when called with zero', () => {
    expect(clampPage(0)).toBe(1)
  })

  it('returns 1 when called with a negative number', () => {
    expect(clampPage(-10)).toBe(1)
  })

  it('returns 1 when called with a non-number value', () => {
    expect(clampPage('3' as unknown as number)).toBe(1)
  })

  it('returns 1 for NaN instead of leaking NaN into range bounds', () => {
    expect(clampPage(Number.NaN)).toBe(1)
  })

  it('returns 1 for a non-integer page', () => {
    expect(clampPage(2.5)).toBe(1)
  })

  it('returns 1 for Infinity, which Number.isInteger rejects', () => {
    expect(clampPage(Number.POSITIVE_INFINITY)).toBe(1)
    expect(clampPage(Number.NEGATIVE_INFINITY)).toBe(1)
  })

  it('returns the value unchanged for a valid positive integer page', () => {
    expect(clampPage(1)).toBe(1)
    expect(clampPage(7)).toBe(7)
  })
})
