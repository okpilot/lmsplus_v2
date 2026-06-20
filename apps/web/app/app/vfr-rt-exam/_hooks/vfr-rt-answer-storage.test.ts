import { beforeEach, describe, expect, it } from 'vitest'
import { loadAnswers, storageKey } from './vfr-rt-answer-storage'

const SESSION = 'sess-1'
const KEY = storageKey(SESSION)

describe('loadAnswers', () => {
  beforeEach(() => localStorage.clear())

  it('returns an empty map when nothing is stored', () => {
    expect(loadAnswers(SESSION)).toEqual({})
  })

  it('returns an empty map for a JSON array', () => {
    localStorage.setItem(KEY, '[]')
    expect(loadAnswers(SESSION)).toEqual({})
  })

  it('returns an empty map for non-JSON garbage', () => {
    localStorage.setItem(KEY, 'not json{{')
    expect(loadAnswers(SESSION)).toEqual({})
  })

  it('loads a well-formed answers map', () => {
    localStorage.setItem(KEY, JSON.stringify({ q1: { mc: 'a' }, q2: { blanks: { 0: 'x' } } }))
    expect(loadAnswers(SESSION)).toEqual({ q1: { mc: 'a' }, q2: { blanks: { 0: 'x' } } })
  })

  it('drops non-object entries and non-string mc/short fields', () => {
    localStorage.setItem(KEY, JSON.stringify({ q1: 123, q2: { mc: 5, short: 'ok' }, q3: ['nope'] }))
    expect(loadAnswers(SESSION)).toEqual({ q2: { short: 'ok' } })
  })

  it('keeps only string-valued blanks and drops the rest', () => {
    localStorage.setItem(KEY, JSON.stringify({ q1: { blanks: { 0: 'cleared', 1: 99 } } }))
    expect(loadAnswers(SESSION)).toEqual({ q1: { blanks: { 0: 'cleared' } } })
  })

  it('ignores a non-object blanks field', () => {
    localStorage.setItem(KEY, JSON.stringify({ q1: { mc: 'b', blanks: 'oops' } }))
    expect(loadAnswers(SESSION)).toEqual({ q1: { mc: 'b' } })
  })

  it('rejects malformed blank keys (non-integer, negative, NaN)', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ q1: { blanks: { 0: 'ok', foo: 'x', '-1': 'y', '1.5': 'z' } } }),
    )
    expect(loadAnswers(SESSION)).toEqual({ q1: { blanks: { 0: 'ok' } } })
  })
})
