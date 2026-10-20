import { describe, expect, it } from 'vitest'
import { filterSetKey, PRELOADED_FILTER_SETS } from './filtered-count-keys'

describe('filterSetKey', () => {
  it('is empty for no filters', () => {
    expect(filterSetKey([])).toBe('')
  })

  it('gives the same key whatever order the filters were picked in', () => {
    expect(filterSetKey(['flagged', 'incorrect'])).toBe(filterSetKey(['incorrect', 'flagged']))
  })

  it('does not reorder the caller array', () => {
    const filters = ['flagged', 'incorrect']
    filterSetKey(filters)
    expect(filters).toEqual(['flagged', 'incorrect'])
  })

  it('gives every preloaded filter set a distinct key', () => {
    const keys = PRELOADED_FILTER_SETS.map(filterSetKey)
    expect(new Set(keys).size).toBe(PRELOADED_FILTER_SETS.length)
  })
})
