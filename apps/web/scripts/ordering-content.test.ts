import { describe, expect, it } from 'vitest'
import { MAX_ORDER_ITEMS, MIN_ORDER_ITEMS } from '../app/app/quiz/actions/ordering-validation'
import { assertOrderingItems, buildOrderingItems } from './ordering-content'

const AT = 'test.json (VRT-ORD-99)'

/** Three distinct steps in canonical order — the shape a content file actually ships. */
const STEPS = ['Contact tower', 'Read back the clearance', 'Taxi to holding point']

/** `n` distinct, non-blank steps — for exercising the bounds without tripping any other check. */
function steps(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `Step number ${i}`)
}

describe('the authored items array', () => {
  it('accepts three distinct steps', () => {
    expect(() => assertOrderingItems(STEPS, AT)).not.toThrow()
  })

  it('accepts the fewest steps that still make an ordering question', () => {
    expect(() => assertOrderingItems(steps(MIN_ORDER_ITEMS), AT)).not.toThrow()
  })

  it('accepts the largest permitted number of steps', () => {
    expect(() => assertOrderingItems(steps(MAX_ORDER_ITEMS), AT)).not.toThrow()
  })

  it('rejects an items field that is not an array', () => {
    expect(() => assertOrderingItems('Contact tower', AT)).toThrow(/'items' must be an array/)
    expect(() => assertOrderingItems(undefined, AT)).toThrow(/'items' must be an array/)
  })

  it('rejects a step that is blank, naming its position', () => {
    // Two entries, so the count is in range and only the blank-step check can fire here.
    expect(() => assertOrderingItems(['Contact tower', '   '], AT)).toThrow(
      /items\[1\] must be a non-empty string/,
    )
  })

  it('rejects a step that is not a string', () => {
    expect(() => assertOrderingItems(['Contact tower', 7], AT)).toThrow(
      /items\[1\] must be a non-empty string/,
    )
  })

  it('rejects too few steps to put in an order', () => {
    expect(() => assertOrderingItems(steps(MIN_ORDER_ITEMS - 1), AT)).toThrow(
      `'items' must hold between ${MIN_ORDER_ITEMS} and ${MAX_ORDER_ITEMS} steps (got 1)`,
    )
  })

  it('rejects more steps than a question may hold', () => {
    expect(() => assertOrderingItems(steps(MAX_ORDER_ITEMS + 1), AT)).toThrow(
      `'items' must hold between ${MIN_ORDER_ITEMS} and ${MAX_ORDER_ITEMS} steps (got 51)`,
    )
  })

  it('rejects two steps that read the same once case and spacing are normalized', () => {
    const repeated = ['Line up', 'Contact tower', 'LINE   UP']
    expect(() => assertOrderingItems(repeated, AT)).toThrow(
      /items\[0\] and items\[2\] are the same step once case and whitespace are normalized/,
    )
  })

  it('names both offending steps when two of them read the same', () => {
    expect(() => assertOrderingItems(['Line up', 'LINE   UP'], AT)).toThrow(/"LINE {3}UP"/)
  })

  it('accepts two steps that differ only in punctuation', () => {
    // Normalization deliberately keeps punctuation — a gate that stripped it would fold these
    // two into one step and reject legitimate content, which is why the earlier heuristic
    // design was retired. The pair is chosen so that stripping punctuation WOULD collide them.
    expect(() => assertOrderingItems(['Line up, RWY 27', 'Line up RWY 27'], AT)).not.toThrow()
  })
})

describe('the stored items built from authored text', () => {
  it('keeps the authored order, because that order is the answer', () => {
    expect(buildOrderingItems(STEPS, AT).map((item) => item.text)).toEqual(STEPS)
  })

  it('gives every step an id derived from its own text', () => {
    // Literal ids: they are written to the database and referenced by every stored answer, so a
    // change to the derivation must fail here rather than silently orphan existing rows.
    expect(buildOrderingItems(['Line up', 'Contact tower'], AT)).toEqual([
      { id: 'o1d69d3e49', text: 'Line up' },
      { id: 'o10bd3ae1a', text: 'Contact tower' },
    ])
  })

  it('gives a step the same id wherever it appears', () => {
    const first = buildOrderingItems(['Contact tower', 'Line up'], AT)
    const second = buildOrderingItems(['Line up', 'Contact tower'], AT)
    expect(first[1].id).toBe(second[0].id)
  })

  it('rejects steps that would share one id, blaming normalization', () => {
    expect(() => buildOrderingItems(['Line up', 'LINE   UP'], AT)).toThrow(
      /both derive the id 'o1d69d3e49'/,
    )
    expect(() => buildOrderingItems(['Line up', 'LINE   UP'], AT)).toThrow(
      /capitalisation or spacing/,
    )
  })
})
