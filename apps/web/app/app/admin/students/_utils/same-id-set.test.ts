import { describe, expect, it } from 'vitest'
import { sameIdSet } from './same-id-set'

describe('sameIdSet', () => {
  it('is true for identical lists', () => {
    expect(sameIdSet(['a', 'b'], ['a', 'b'])).toBe(true)
  })

  it('is true for the same ids in a different order', () => {
    expect(sameIdSet(['a', 'b', 'c'], ['c', 'a', 'b'])).toBe(true)
  })

  it('ignores duplicate ids', () => {
    expect(sameIdSet(['a', 'a', 'b'], ['b', 'a'])).toBe(true)
  })

  it('is true for two empty lists', () => {
    expect(sameIdSet([], [])).toBe(true)
  })

  it('is false when one list has an extra id', () => {
    expect(sameIdSet(['a'], ['a', 'b'])).toBe(false)
  })

  it('is false when the ids differ but the counts match', () => {
    expect(sameIdSet(['a', 'b'], ['a', 'c'])).toBe(false)
  })

  it('is false when duplicates make the lengths match but the sets differ', () => {
    expect(sameIdSet(['a', 'a'], ['a', 'b'])).toBe(false)
  })
})
