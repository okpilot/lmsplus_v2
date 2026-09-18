// Unit coverage for the integration tier's fixture-namespace generator. The tier
// itself is CI-only (real Postgres); this pins the one property it depends on and
// needs no database.
import { describe, expect, it, vi } from 'vitest'
import { fixtureSuffix } from '@/lib/integration-support/fixture-suffix'

describe('fixtureSuffix', () => {
  // MUTATION: drop the randomUUID half (return `${Date.now()}`) — every call in
  // the loop lands at the same frozen timestamp, the Set collapses to size 1,
  // and this goes red. That is the exact defect the helper exists to prevent:
  // test FILES run in parallel processes (pool: 'forks'), so a same-millisecond
  // collision silently shares one org and one subject row between two of them.
  it('produces a distinct value for calls made within the same millisecond', () => {
    // Freeze Date.now() so every call has the same timestamp half. Any
    // uniqueness must come from the randomUUID half, not the clock advancing.
    // This removes the original `toBeLessThan(50)` timing guard, which was a
    // flake risk on loaded CI runners where 500 UUID calls can exceed 50 ms.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    try {
      const generated = Array.from({ length: 500 }, () => fixtureSuffix())
      expect(new Set(generated).size).toBe(generated.length)
    } finally {
      vi.useRealTimers()
    }
  })

  it('leads with a millisecond timestamp so leftover rows sort chronologically', () => {
    const before = Date.now()
    const [stamp] = fixtureSuffix().split('-')

    expect(Number(stamp)).toBeGreaterThanOrEqual(before)
    expect(Number(stamp)).toBeLessThanOrEqual(Date.now())
  })

  it('stays well inside the 64-character email local-part limit', () => {
    // Longest prefix in the tier is `int-iexam-codes-admin-` at 22 characters.
    expect(`int-iexam-codes-admin-${fixtureSuffix()}`.length).toBeLessThan(64)
  })
})
