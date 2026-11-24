import { describe, expect, it } from 'vitest'
import { isoToUtcInput, modeLabel, statusLabel, utcInputToIso } from './sitting-labels'

describe('sitting labels', () => {
  it('labels every status as plain text', () => {
    expect(statusLabel('scheduled')).toBe('Scheduled')
    expect(statusLabel('open')).toBe('Open')
    expect(statusLabel('closed')).toBe('Closed')
    expect(statusLabel('cancelled')).toBe('Cancelled')
  })

  it('labels modes', () => {
    expect(modeLabel('remote')).toBe('Remote')
    expect(modeLabel('in_person')).toBe('In person')
  })
})

describe('UTC datetime-local conversion', () => {
  it.each([
    '2026-11-18T09:30:00.000Z',
    '2026-11-18T23:59:00.000Z',
    '2026-03-29T00:30:00.000Z',
    '2026-10-25T01:30:00.000Z',
  ])('round-trips %s', (iso) => {
    expect(utcInputToIso(isoToUtcInput(iso))).toBe(iso)
  })

  it('reads an ISO instant as a UTC input value', () => {
    expect(isoToUtcInput('2026-11-18T09:30:00.000Z')).toBe('2026-11-18T09:30')
  })

  it('appends :00.000Z without going through the local timezone', () => {
    expect(utcInputToIso('2026-11-18T23:59')).toBe('2026-11-18T23:59:00.000Z')
  })

  it('refuses a malformed input value', () => {
    expect(() => utcInputToIso('18/11/2026 09:30')).toThrow()
  })
})
