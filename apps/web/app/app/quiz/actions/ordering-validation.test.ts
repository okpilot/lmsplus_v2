import { describe, expect, it } from 'vitest'
import { isUniquePermutation, MAX_ORDER_ITEMS, MIN_ORDER_ITEMS } from './ordering-validation'

describe('ordering-validation constants', () => {
  it('MIN_ORDER_ITEMS equals 2', () => {
    expect(MIN_ORDER_ITEMS).toBe(2)
  })

  it('MAX_ORDER_ITEMS equals 50', () => {
    expect(MAX_ORDER_ITEMS).toBe(50)
  })
})

describe('isUniquePermutation', () => {
  it('returns true when all ids are distinct', () => {
    expect(isUniquePermutation(['a', 'b', 'c'])).toBe(true)
  })

  it('returns false when a duplicate id is present', () => {
    expect(isUniquePermutation(['a', 'b', 'a'])).toBe(false)
  })

  it('returns true for an empty array', () => {
    expect(isUniquePermutation([])).toBe(true)
  })

  it('returns true for a single-element array', () => {
    expect(isUniquePermutation(['x'])).toBe(true)
  })
})
