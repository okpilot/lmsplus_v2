import { describe, expect, it } from 'vitest'
import { clampIndex } from './clamp-index'

describe('clampIndex', () => {
  it('returns 0 when length is 0', () => {
    expect(clampIndex(5, 0)).toBe(0)
  })

  it('returns 0 when length is negative', () => {
    expect(clampIndex(3, -1)).toBe(0)
  })

  it('returns 0 when index is undefined', () => {
    expect(clampIndex(undefined, 5)).toBe(0)
  })

  it('returns 0 when index is 0', () => {
    expect(clampIndex(0, 5)).toBe(0)
  })

  it('returns index unchanged when within bounds', () => {
    expect(clampIndex(2, 5)).toBe(2)
  })

  it('returns last valid index when index equals length', () => {
    expect(clampIndex(5, 5)).toBe(4)
  })

  it('returns last valid index when index exceeds length', () => {
    expect(clampIndex(100, 5)).toBe(4)
  })

  it('returns 0 when index is negative', () => {
    expect(clampIndex(-3, 5)).toBe(0)
  })

  it('returns 0 for a single-element array at any index', () => {
    expect(clampIndex(99, 1)).toBe(0)
  })
})
