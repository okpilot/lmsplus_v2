import { describe, expect, it } from 'vitest'
import { splitTabs } from './split-tabs'

const ITEMS = ['a', 'b', 'c', 'd', 'e']

describe('splitTabs', () => {
  it('shows every item when they all fit', () => {
    expect(splitTabs(ITEMS, 5)).toEqual({ visible: ITEMS, hidden: [] })
    expect(splitTabs(ITEMS, 9)).toEqual({ visible: ITEMS, hidden: [] })
  })

  it('reserves one slot for More when items overflow', () => {
    expect(splitTabs(ITEMS, 3)).toEqual({ visible: ['a', 'b'], hidden: ['c', 'd', 'e'] })
  })

  it('hides every item when only one slot fits', () => {
    expect(splitTabs(ITEMS, 1)).toEqual({ visible: [], hidden: ITEMS })
  })

  it('hides every item when no slot fits', () => {
    expect(splitTabs(ITEMS, 0)).toEqual({ visible: [], hidden: ITEMS })
  })
})
