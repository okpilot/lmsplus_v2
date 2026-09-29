import { describe, expect, it } from 'vitest'
import { orderingItem, orderingItemId } from './ordering-item-id'

describe('orderingItemId', () => {
  // MUTATION: drop the normalize step (hash the raw text) — this assertion goes red, since the
  // known vector below was computed against the NORMALIZED form, not the raw string.
  it('matches the known SQL/JS derivation vector for a mixed-case, padded string', () => {
    // Cross-checked 2026-09-28 against both `ordering_item_id('  Mayday  MAYDAY mayday ')` in
    // Postgres and `deriveContentId('o', ['  Mayday  MAYDAY mayday '])` in apps/web/scripts.
    expect(orderingItemId('  Mayday  MAYDAY mayday ')).toBe('o1459c75a5')
  })

  it('derives the same id for inputs differing only in case, spacing, or surrounding whitespace', () => {
    const canonical = orderingItemId('engine failure')
    expect(orderingItemId('Engine   Failure')).toBe(canonical)
    expect(orderingItemId('  engine failure  ')).toBe(canonical)
    expect(orderingItemId('ENGINE FAILURE')).toBe(canonical)
  })

  it('derives a different id when the visible text differs', () => {
    expect(orderingItemId('engine failure')).not.toBe(orderingItemId('forced landing'))
  })

  it('always starts with the o1 version prefix', () => {
    expect(orderingItemId('anything')).toMatch(/^o1[0-9a-f]{8}$/)
  })
})

describe('orderingItem', () => {
  it('pairs the derived id with the given text unchanged', () => {
    expect(orderingItem('MAYDAY MAYDAY MAYDAY')).toEqual({
      id: orderingItemId('MAYDAY MAYDAY MAYDAY'),
      text: 'MAYDAY MAYDAY MAYDAY',
    })
  })
})
