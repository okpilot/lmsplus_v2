import { describe, expect, it } from 'vitest'
import { requireRpcResult, requireRpcRows } from './guards'

describe('requireRpcResult', () => {
  it('returns the object unchanged when given a non-null object', () => {
    const obj = { questions: [{ id: 'q1' }] }
    expect(requireRpcResult<typeof obj>(obj, 'fn')).toBe(obj)
  })

  it('throws a labelled error when the result is null', () => {
    expect(() => requireRpcResult(null, 'get_results')).toThrow(
      'get_results: expected a non-null object result, got null',
    )
  })

  it('throws a labelled error when the result is undefined', () => {
    expect(() => requireRpcResult(undefined, 'get_results')).toThrow(
      'get_results: expected a non-null object result, got undefined',
    )
  })

  it('throws when the result is an array (caller wanted an object)', () => {
    expect(() => requireRpcResult([], 'get_results')).toThrow(
      'get_results: expected a non-null object result, got array',
    )
  })

  it('throws when the result is a primitive', () => {
    expect(() => requireRpcResult('oops', 'get_results')).toThrow(
      'get_results: expected a non-null object result, got string',
    )
  })
})

describe('requireRpcRows', () => {
  it('returns the array unchanged when given an array', () => {
    const rows = [{ id: 'q1' }, { id: 'q2' }]
    expect(requireRpcRows<{ id: string }>(rows, 'fn')).toBe(rows)
  })

  it('returns an empty array unchanged', () => {
    const rows: unknown[] = []
    expect(requireRpcRows(rows, 'fn')).toBe(rows)
  })

  it('throws a labelled error when the result is null', () => {
    expect(() => requireRpcRows(null, 'get_questions')).toThrow(
      'get_questions: expected an array result, got null',
    )
  })

  it('throws a labelled error when the result is a non-array object', () => {
    expect(() => requireRpcRows({}, 'get_questions')).toThrow(
      'get_questions: expected an array result, got object',
    )
  })
})
