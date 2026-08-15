import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  buildSubmitPayload,
  deriveBlankIndices,
  toBlankResults,
  toSeedValues,
  useDialogFillInput,
} from './use-dialog-fill-input'

const TEMPLATE = '[atc] {{0}} runway {{1}}.'

describe('deriveBlankIndices', () => {
  it('lists every blank index in the template in order', () => {
    expect(deriveBlankIndices(TEMPLATE)).toEqual([0, 1])
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

describe('useDialogFillInput', () => {
  it('starts with no submission available until every blank is filled', () => {
    const { result } = renderHook(() => useDialogFillInput(TEMPLATE, undefined))
    expect(result.current.allFilled).toBe(false)
    expect(result.current.collectSubmission()).toBeNull()
  })

  it('seeds the input values from a resumed draft answer', () => {
    const { result } = renderHook(() =>
      useDialogFillInput(TEMPLATE, undefined, [
        { index: 0, text: 'cleared to land' },
        { index: 1, text: '27' },
      ]),
    )
    expect(result.current.values).toEqual({ 0: 'cleared to land', 1: '27' })
    expect(result.current.allFilled).toBe(true)
  })

  it('treats a partially-answered resumed draft as still incomplete', () => {
    const { result } = renderHook(() =>
      useDialogFillInput(TEMPLATE, undefined, [{ index: 0, text: 'cleared to land' }]),
    )
    expect(result.current.values).toEqual({ 0: 'cleared to land' })
    expect(result.current.allFilled).toBe(false)
  })

  it('offers the trimmed submission once every blank is filled', () => {
    const { result } = renderHook(() => useDialogFillInput(TEMPLATE, undefined))
    act(() => result.current.handleChange(0, '  cleared  '))
    act(() => result.current.handleChange(1, '27'))
    expect(result.current.allFilled).toBe(true)
    expect(result.current.collectSubmission()).toEqual([
      { index: 0, text: 'cleared' },
      { index: 1, text: '27' },
    ])
  })

  it('withholds the submission while any blank is still empty', () => {
    const { result } = renderHook(() => useDialogFillInput(TEMPLATE, undefined))
    act(() => result.current.handleChange(0, 'cleared'))
    expect(result.current.allFilled).toBe(false)
    expect(result.current.collectSubmission()).toBeNull()
  })

  it('begins empty on a fresh mount of the same template', () => {
    const { result } = renderHook(() => useDialogFillInput(TEMPLATE, undefined))
    expect(result.current.allFilled).toBe(false)
    expect(result.current.values).toEqual({})
  })
})
