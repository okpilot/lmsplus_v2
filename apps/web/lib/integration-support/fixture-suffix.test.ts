// Unit coverage for the integration tier's fixture-namespace generator. The tier
// itself is CI-only (real Postgres); this pins the one property it depends on and
// needs no database.
import { describe, expect, it } from 'vitest'
import { fixtureSuffix } from '@/lib/integration-support/fixture-suffix'

describe('fixtureSuffix', () => {
  // MUTATION: drop the randomUUID half (return `${Date.now()}`) — every call in
  // the loop lands in the same millisecond, the Set collapses, and this goes red.
  // That is the exact defect the helper exists to prevent: test FILES run in
  // parallel processes (pool: 'forks'), so a same-millisecond collision silently
  // shares one org and one subject row between two of them.
  it('produces a distinct value for calls made within the same millisecond', () => {
    const start = Date.now()
    const generated = Array.from({ length: 500 }, () => fixtureSuffix())

    expect(new Set(generated).size).toBe(generated.length)
    // Non-vacuous: proves the loop ran inside a clock tick or two, so uniqueness
    // above cannot be explained away by the timestamp having advanced.
    expect(Date.now() - start).toBeLessThan(50)
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
