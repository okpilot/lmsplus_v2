import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useVfrRtAnswers } from './use-vfr-rt-answers'

const SESSION = 'sess-1'
const KEY = `vfr-rt-answers:${SESSION}`

describe('useVfrRtAnswers', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('records a multiple-choice selection for a question', () => {
    const { result } = renderHook(() => useVfrRtAnswers(SESSION))
    act(() => result.current.setMc('q-1', 'opt-a'))
    expect(result.current.answers['q-1']).toEqual({ mc: 'opt-a' })
  })

  it('records a short-answer text for a question', () => {
    const { result } = renderHook(() => useVfrRtAnswers(SESSION))
    act(() => result.current.setShort('q-2', 'QNH'))
    expect(result.current.answers['q-2']).toEqual({ short: 'QNH' })
  })

  it('records dialog blanks keyed by blank index', () => {
    const { result } = renderHook(() => useVfrRtAnswers(SESSION))
    act(() => result.current.setBlank('q-3', 0, 'cleared'))
    act(() => result.current.setBlank('q-3', 1, 'takeoff'))
    expect(result.current.answers['q-3']).toEqual({ blanks: { 0: 'cleared', 1: 'takeoff' } })
  })

  it('persists answers to localStorage', () => {
    const { result } = renderHook(() => useVfrRtAnswers(SESSION))
    act(() => result.current.setShort('q-1', 'hello'))
    const stored = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    expect(stored).toEqual({ 'q-1': { short: 'hello' } })
  })

  it('loads previously saved answers on a fresh mount', () => {
    localStorage.setItem(KEY, JSON.stringify({ 'q-5': { mc: 'opt-c' } }))
    const { result } = renderHook(() => useVfrRtAnswers(SESSION))
    expect(result.current.answers['q-5']).toEqual({ mc: 'opt-c' })
  })
})
