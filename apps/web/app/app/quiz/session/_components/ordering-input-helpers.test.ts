import { describe, expect, it } from 'vitest'
import { type OrderingItem, orderFromSubmitted } from './ordering-input-helpers'

const ITEMS: OrderingItem[] = [
  { id: 'a', text: 'Alpha' },
  { id: 'b', text: 'Bravo' },
  { id: 'c', text: 'Charlie' },
]

describe('orderFromSubmitted', () => {
  it('shows the delivered order when the answer is not yet submitted', () => {
    expect(orderFromSubmitted(ITEMS, false, ['c', 'b', 'a'])).toEqual(ITEMS)
  })

  it('shows the delivered order when there is no submitted sequence', () => {
    expect(orderFromSubmitted(ITEMS, true, undefined)).toEqual(ITEMS)
  })

  it('restores the student submitted sequence by id', () => {
    expect(orderFromSubmitted(ITEMS, true, ['c', 'a', 'b'])).toEqual([
      { id: 'c', text: 'Charlie' },
      { id: 'a', text: 'Alpha' },
      { id: 'b', text: 'Bravo' },
    ])
  })

  it('falls back to the delivered order when the submitted length differs', () => {
    expect(orderFromSubmitted(ITEMS, true, ['a', 'b'])).toEqual(ITEMS)
  })

  it('falls back to the delivered order when the submitted sequence repeats an id', () => {
    // A duplicate id is not a permutation — restoring it would render 'a' twice and
    // silently drop 'c'. The fallback keeps the displayed order honest.
    expect(orderFromSubmitted(ITEMS, true, ['a', 'a', 'b'])).toEqual(ITEMS)
  })

  it('falls back to the delivered order when a submitted id does not resolve', () => {
    expect(orderFromSubmitted(ITEMS, true, ['a', 'b', 'x'])).toEqual(ITEMS)
  })
})
