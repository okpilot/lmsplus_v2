import { describe, expect, it } from 'vitest'
import { readSkipped } from './read-skipped'

describe('readSkipped field guards (AC 58)', () => {
  it.each([
    [{ subject_id: 's', reason: 'passed' }],
    [{ user_id: 'u', reason: 'passed' }],
    [{ user_id: 'u', subject_id: 's' }],
    [{ user_id: 'u', subject_id: 's', reason: 5 }],
  ])('drops a row with a missing or non-string field %j', (row) => {
    expect(readSkipped([row])).toEqual([])
  })

  it('keeps the valid rows around a malformed one, in order', () => {
    const ok = (n: string) => ({ user_id: n, subject_id: 's', reason: 'existing' })
    expect(readSkipped([ok('a'), { user_id: 1 }, ok('b')]).map((r) => r.userId)).toEqual(['a', 'b'])
  })

  it('ignores a non-string detail_at', () => {
    const r = readSkipped([{ user_id: 'u', subject_id: 's', reason: 'passed', detail_at: 5 }])
    expect(r[0]).not.toHaveProperty('detailAt')
  })
})
