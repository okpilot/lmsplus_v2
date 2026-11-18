import { describe, expect, it } from 'vitest'
import { readSkipped } from './read-skipped'

describe('readSkipped (AC 39, 58)', () => {
  it('maps user_id, subject_id, reason and detail_at', () => {
    expect(
      readSkipped([
        { user_id: 'u', subject_id: 's', reason: 'passed', detail_at: '2026-11-01T10:00:00Z' },
      ]),
    ).toEqual([{ userId: 'u', subjectId: 's', reason: 'passed', detailAt: '2026-11-01T10:00:00Z' }])
  })

  it('omits detailAt when the RPC stripped it', () => {
    const r = readSkipped([{ user_id: 'u', subject_id: 's', reason: 'existing' }])
    expect(r[0]).not.toHaveProperty('detailAt')
  })

  it('drops malformed rows and non-array input', () => {
    expect(readSkipped([{ user_id: 1 }, null, 'x'])).toEqual([])
    expect(readSkipped(null)).toEqual([])
    expect(readSkipped({})).toEqual([])
  })
})
