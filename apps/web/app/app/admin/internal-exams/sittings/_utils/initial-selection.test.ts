import { describe, expect, it } from 'vitest'
import { initialSelectionOf } from './initial-selection'

describe('initialSelectionOf (AC 35)', () => {
  it('seeds all-mode for all', () => {
    expect(initialSelectionOf({ kind: 'all' })).toEqual({ ids: [], all: true })
  })
  it('seeds the validated ids', () => {
    expect(initialSelectionOf({ kind: 'ids', ids: ['a', 'b'], truncated: true })).toEqual({
      ids: ['a', 'b'],
      all: false,
    })
  })
  it.each([{ kind: 'whole' as const }, { kind: 'empty' as const }])('seeds nothing for %j', (s) => {
    expect(initialSelectionOf(s)).toEqual({ ids: [], all: false })
  })
})
