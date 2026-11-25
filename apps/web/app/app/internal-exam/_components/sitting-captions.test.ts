import { describe, expect, it } from 'vitest'
import {
  canStart,
  formatAbsolute,
  formatRelative,
  sittingHint,
  sittingWhen,
} from './sitting-captions'

const NOW = new Date('2026-11-25T12:00:00.000Z')
const at = (ms: number) => new Date(NOW.getTime() + ms).toISOString()

describe('formatRelative', () => {
  // The marker an expired row shows. Losing it leaves "Expires <date>" with Start still enabled.
  it('reports a past time as expired', () => {
    expect(formatRelative(at(-1), NOW)).toBe('expired')
    expect(formatRelative(at(0), NOW)).toBe('expired')
  })

  it('counts minutes under an hour', () => {
    expect(formatRelative(at(30 * 60_000), NOW)).toBe('in 30 min')
  })

  it('counts hours under two days', () => {
    expect(formatRelative(at(5 * 3_600_000), NOW)).toBe('in 5 h')
  })

  it('counts days from two days out', () => {
    expect(formatRelative(at(72 * 3_600_000), NOW)).toBe('in 3 d')
  })

  it('says nothing for an unparseable date', () => {
    expect(formatRelative('not a date', NOW)).toBe('')
  })
})

describe('formatAbsolute', () => {
  it('returns the input unchanged when it cannot be parsed', () => {
    expect(formatAbsolute('not a date')).toBe('not a date')
  })
})

describe('sittingHint', () => {
  it('tells an open sitting it works now', () => {
    expect(sittingHint('open')).toContain('while the sitting is open')
  })

  it('tells a scheduled sitting to reload', () => {
    expect(sittingHint('scheduled')).toContain('reload')
  })

  it('says cancelled, not ended, for a cancelled sitting', () => {
    expect(sittingHint('cancelled')).toContain('cancelled')
    expect(sittingHint('cancelled')).not.toContain('ended')
  })

  it('says ended for a closed sitting', () => {
    expect(sittingHint('closed')).toContain('ended')
  })

  // An unknown status reaches here as null. Claiming 'cancelled' or 'ended' would describe a
  // sitting that may still run.
  it('claims nothing about an unknown status', () => {
    const hint = sittingHint(null)
    expect(hint).not.toContain('cancelled')
    expect(hint).not.toContain('ended')
    expect(hint).toContain('Ask your invigilator')
  })
})

describe('canStart', () => {
  it('allows only an open sitting', () => {
    expect(canStart('open')).toBe(true)
  })

  it('refuses scheduled, closed and cancelled', () => {
    expect(canStart('scheduled')).toBe(false)
    expect(canStart('closed')).toBe(false)
    expect(canStart('cancelled')).toBe(false)
  })

  // An unknown status arrives as null, and must not be startable.
  it('refuses an unknown status', () => {
    expect(canStart(null)).toBe(false)
    expect(canStart(undefined)).toBe(false)
  })
})

describe('sittingWhen', () => {
  it('formats a parseable date', () => {
    expect(sittingWhen('2026-05-01T09:00:00.000Z')).toContain('2026')
  })

  it('returns null rather than the words Invalid Date', () => {
    expect(sittingWhen('not a date')).toBeNull()
  })
})
