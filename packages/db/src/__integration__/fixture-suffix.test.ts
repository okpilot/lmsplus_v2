import { describe, expect, it, vi } from 'vitest'
import { fixtureSuffix } from './fixture-suffix'

// `randomUUID` is mocked to a deterministic sequence. Left real, the uniqueness test below draws
// 500 values from the 2^32 space `fixtureSuffix` slices to, which collide about once in 34,000
// runs — a flake, in the file whose whole purpose is removing flakes. Mocking moves the assertion
// onto the claim this unit can own: the random component reaches the returned value. Whether 2^32
// is ENOUGH is a design judgement recorded in the helper's JSDoc; no test can settle it.
const { uuid } = vi.hoisted(() => ({ uuid: { n: 0 } }))
vi.mock('node:crypto', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:crypto')>()),
  randomUUID: () => `${(uuid.n++).toString(16).padStart(8, '0')}-0000-4000-8000-000000000000`,
}))

describe('fixtureSuffix', () => {
  // MUTATION: drop the randomUUID half (return `${Date.now()}`) — every call in the loop lands at
  // the same frozen timestamp, the Set collapses to size 1, and this goes red.
  it('produces a distinct value for calls made within the same millisecond', () => {
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
    // Two literal email prefixes in this tier tie for longest, so cite the length, not a name:
    //   grep -rho --include='*.ts' -E 'email: `[^`]*\$\{suffix\}' packages/db/src/__integration__ \
    //     | sed 's/email: `//;s/\$\{suffix\}//' | sort -u | awk '{print length($0)}' | sort -rn | head -1
    expect(`student-diagramgraderevoke-${fixtureSuffix()}`.length).toBeLessThan(64)
  })
})
