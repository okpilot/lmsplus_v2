import { describe, expect, it } from 'vitest'
import { isEnded, isGone } from './is-ended'

describe('isEnded / isGone', () => {
  it('recognises the ended result only', () => {
    expect(isEnded({ ended: true })).toBe(true)
    expect(isEnded(null)).toBe(false)
    expect(isEnded([])).toBe(false)
    expect(isEnded({ rows: [], total: 0 })).toBe(false)
  })

  it('isGone adds null (sitting not found)', () => {
    expect(isGone(null)).toBe(true)
    expect(isGone({ ended: true })).toBe(true)
    expect(isGone([])).toBe(false)
    expect(isGone({ rows: [], total: 0 })).toBe(false)
  })
})
