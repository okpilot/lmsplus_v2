import { afterEach, describe, expect, it } from 'vitest'
import { formatUtc } from './format-utc'

const originalTz = process.env.TZ
afterEach(() => {
  if (originalTz === undefined) delete process.env.TZ
  else process.env.TZ = originalTz
})

const ISO = '2026-03-15T23:30:00Z'

describe('formatUtc', () => {
  it.each(['America/Los_Angeles', 'Pacific/Kiritimati', 'UTC'])(
    'formats identically in en-GB UTC whatever the host TZ (%s)',
    (tz) => {
      process.env.TZ = tz
      expect(formatUtc(ISO, { dateStyle: 'medium' })).toBe('15 Mar 2026')
    },
  )

  it('accepts an ISO string, epoch ms and a Date alike', () => {
    const opts = { dateStyle: 'medium' } as const
    const ms = Date.parse(ISO)
    expect(formatUtc(ms, opts)).toBe('15 Mar 2026')
    expect(formatUtc(new Date(ms), opts)).toBe('15 Mar 2026')
    expect(formatUtc(ISO, opts)).toBe('15 Mar 2026')
  })

  it('ignores a caller-supplied timeZone', () => {
    // @ts-expect-error -- timeZone is not accepted; a runtime caller bypassing the type still gets UTC
    expect(formatUtc(ISO, { dateStyle: 'medium', timeZone: 'Pacific/Kiritimati' })).toBe(
      '15 Mar 2026',
    )
  })

  it('appends " UTC" when timeStyle is set', () => {
    expect(formatUtc(ISO, { dateStyle: 'medium', timeStyle: 'short' })).toBe(
      '15 Mar 2026, 23:30 UTC',
    )
  })

  it('appends " UTC" when hour is set', () => {
    expect(formatUtc(ISO, { hour: '2-digit', minute: '2-digit' })).toBe('23:30 UTC')
  })

  it('adds no suffix for date-only options', () => {
    expect(formatUtc(ISO, { day: '2-digit', month: 'short', year: 'numeric' })).toBe('15 Mar 2026')
  })

  it('appends " UTC" when only minute and second are shown', () => {
    expect(formatUtc(ISO, { minute: '2-digit', second: '2-digit' })).toMatch(/ UTC$/)
  })

  it('shows the UTC label exactly once for dateStyle long with timeStyle long', () => {
    const out = formatUtc(ISO, { dateStyle: 'long', timeStyle: 'long' })
    expect(out.match(/UTC/g)).toHaveLength(1)
  })

  it('shows the UTC label exactly once when timeZoneName is requested with an hour', () => {
    const out = formatUtc(ISO, { hour: '2-digit', timeZoneName: 'short' })
    expect(out.match(/UTC/g)).toHaveLength(1)
  })

  it('labels a day-period-only time as UTC', () => {
    expect(formatUtc(ISO, { dayPeriod: 'short' })).toMatch(/ UTC$/)
  })

  it('adds no extra suffix to a date-only format that requests timeZoneName', () => {
    const out = formatUtc(ISO, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZoneName: 'short',
    })
    expect(out.match(/UTC/g)).toHaveLength(1)
    expect(out).not.toMatch(/UTC UTC/)
  })
})
