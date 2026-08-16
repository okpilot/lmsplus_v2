import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useDialogFillInput } from './use-dialog-fill-input'

const TEMPLATE = '[atc] {{0}} runway {{1}}.'

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

  it('exposes the per-blank grading results keyed by blank index', () => {
    const { result } = renderHook(() =>
      useDialogFillInput(TEMPLATE, [
        { index: 0, isCorrect: true, canonical: 'cleared to land' },
        { index: 1, isCorrect: false, canonical: '27' },
      ]),
    )
    expect(result.current.results).toEqual({
      0: { isCorrect: true, canonical: 'cleared to land' },
      1: { isCorrect: false, canonical: '27' },
    })
  })

  it('begins empty on a fresh mount of the same template', () => {
    const { result } = renderHook(() => useDialogFillInput(TEMPLATE, undefined))
    expect(result.current.allFilled).toBe(false)
    expect(result.current.values).toEqual({})
  })
})
