import { describe, expect, it } from 'vitest'
import { formatClock } from './format-clock'

describe('formatClock', () => {
  it.each([
    [0, '00:00'],
    [59, '00:59'],
    [125, '02:05'],
    [3600, '1:00:00'],
    [172807, '48:00:07'],
    [-5, '00:00'],
  ])('%d -> %s', (input, expected) => {
    expect(formatClock(input)).toBe(expected)
  })
})
