import { describe, expect, it } from 'vitest'
import {
  buildSubmitPayload,
  deriveBlankIndices,
  toBlankResults,
  toSeedValues,
} from './dialog-fill-helpers'

const TEMPLATE = '[atc] {{0}} runway {{1}}.'

describe('deriveBlankIndices', () => {
  it('lists every blank index in the template in order', () => {
    expect(deriveBlankIndices(TEMPLATE)).toEqual([0, 1])
  })

  // The fixture above cannot tell template order from a numeric sort: it places {{0}} before
  // {{1}}, so both orderings produce [0, 1] and the assertion would survive a `.sort()` being
  // added to deriveBlankIndices (#1200). This one puts the HIGHER index first, so template
  // order gives [1, 0] while a numeric sort gives [0, 1] — the two are now distinguishable.
  // This pins a CONTRACT, not a behaviour observable today. `deriveBlankIndices` is documented as
  // returning TEMPLATE order, and dialog-fill-input.tsx records that a template may print a higher
  // index first — which is why its Enter navigation reads DOM position instead of trusting index
  // order. No shipped Part 2 template actually does, and both consumers (`allFilled`'s `.every`,
  // and `buildSubmitPayload`'s index-keyed rows the RPC matches on `blank_index`) are order-
  // insensitive, so a `.sort()` would be behaviour-neutral TODAY. This fixture is what keeps the
  // documented order true when that stops being so.
  it('keeps a later-numbered blank first when the template prints it first', () => {
    expect(deriveBlankIndices('[pilot] {{1}} then {{0}}.')).toEqual([1, 0])
  })

  it('de-duplicates a blank index that appears more than once', () => {
    expect(deriveBlankIndices('[atc] {{0}} then {{0}} again {{1}}.')).toEqual([0, 1])
  })

  it('returns an empty list when the template has no blanks', () => {
    expect(deriveBlankIndices('[atc] no blanks here.')).toEqual([])
  })
})

describe('toBlankResults', () => {
  it('keys per-blank grading results by their blank index', () => {
    expect(
      toBlankResults([
        { index: 0, isCorrect: true, canonical: 'cleared to land' },
        { index: 1, isCorrect: false, canonical: '27' },
      ]),
    ).toEqual({
      0: { isCorrect: true, canonical: 'cleared to land' },
      1: { isCorrect: false, canonical: '27' },
    })
  })

  it('returns an empty map when no results are provided', () => {
    expect(toBlankResults(undefined)).toEqual({})
    expect(toBlankResults([])).toEqual({})
  })
})

describe('buildSubmitPayload', () => {
  it('trims each blank value and pairs it with its index', () => {
    expect(buildSubmitPayload([0, 1], { 0: '  cleared to land  ', 1: '27' })).toEqual([
      { index: 0, text: 'cleared to land' },
      { index: 1, text: '27' },
    ])
  })

  it('emits an empty string for a blank with no recorded value', () => {
    expect(buildSubmitPayload([0], {})).toEqual([{ index: 0, text: '' }])
  })
})

describe('toSeedValues', () => {
  it('keys each submitted blank text by its index', () => {
    expect(
      toSeedValues([
        { index: 0, text: 'cleared to land' },
        { index: 1, text: '27' },
      ]),
    ).toEqual({ 0: 'cleared to land', 1: '27' })
  })

  it('returns an empty map when there is no resumed draft', () => {
    expect(toSeedValues(undefined)).toEqual({})
    expect(toSeedValues(null)).toEqual({})
    expect(toSeedValues([])).toEqual({})
  })
})
