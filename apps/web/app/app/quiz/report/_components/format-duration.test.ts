import { describe, expect, it } from 'vitest'
import { formatMsDuration } from './format-duration'

describe('formatMsDuration', () => {
  it('shows seconds only under one minute', () => {
    expect(formatMsDuration(35_000)).toBe('35s')
  })

  it('rounds sub-second values to whole seconds', () => {
    expect(formatMsDuration(500)).toBe('1s')
    expect(formatMsDuration(0)).toBe('0s')
  })

  it('shows minutes and seconds at exactly one minute', () => {
    expect(formatMsDuration(60_000)).toBe('1m 0s')
  })

  it('shows minutes and seconds for durations over a minute', () => {
    expect(formatMsDuration(95_300)).toBe('1m 35s')
    expect(formatMsDuration(132_000)).toBe('2m 12s')
  })

  it('includes hours for long durations', () => {
    expect(formatMsDuration(3_725_000)).toBe('1h 2m 5s')
  })

  it('clamps negative input to zero', () => {
    expect(formatMsDuration(-1)).toBe('0s')
  })
})
