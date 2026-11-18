import { describe, expect, it } from 'vitest'
import type { RosterEntry } from '../types'
import { personNeedsCode, SHOW_OPTIONS, sharedExpiry } from './person-rollup'

const e = (status: string, codeExpiresAt: string | null): RosterEntry =>
  ({ entryId: status + codeExpiresAt, status, codeExpiresAt }) as never

describe('SHOW_OPTIONS', () => {
  it('offers All people, Needs code and Has attempts only (no Not emailed until 2c)', () => {
    expect(SHOW_OPTIONS.map((o) => o.label)).toEqual(['All people', 'Needs code', 'Has attempts'])
    expect(SHOW_OPTIONS.map((o) => o.value)).toEqual(['all', 'needs_code', 'attempts'])
  })
})

describe('sharedExpiry', () => {
  it('returns the expiry when every live code shares it', () => {
    expect(
      sharedExpiry([e('waiting', '2026-11-18T23:59:00Z'), e('ready', '2026-11-18T23:59:00Z')]),
    ).toBe('2026-11-18T23:59:00Z')
  })

  it('returns null when live codes expire at different times', () => {
    expect(
      sharedExpiry([e('waiting', '2026-11-18T23:59:00Z'), e('ready', '2026-11-19T23:59:00Z')]),
    ).toBeNull()
  })

  it('ignores entries without a live code', () => {
    expect(
      sharedExpiry([
        e('waiting', '2026-11-18T23:59:00Z'),
        e('expired', '2026-11-10T23:59:00Z'),
        e('no_code', null),
      ]),
    ).toBe('2026-11-18T23:59:00Z')
  })

  it('returns null when there is no live code', () => {
    expect(sharedExpiry([e('expired', '2026-11-10T23:59:00Z')])).toBeNull()
    expect(sharedExpiry([])).toBeNull()
  })
})

describe('personNeedsCode (AC 44)', () => {
  it.each(['no_code', 'expired', 'voided'])('is true when an exam is %s', (status) => {
    expect(personNeedsCode([e('ready', null), e(status, null)])).toBe(true)
  })
  it.each(['waiting', 'ready', 'running', 'finished', 'absent', 'voided_attempt', 'discarded'])(
    'is false when the only exam is %s',
    (status) => {
      expect(personNeedsCode([e(status, null)])).toBe(false)
    },
  )
  it('is false without exams', () => {
    expect(personNeedsCode([])).toBe(false)
  })
})
