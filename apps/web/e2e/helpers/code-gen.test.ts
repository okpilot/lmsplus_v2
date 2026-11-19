import { describe, expect, it } from 'vitest'
import { randomCode } from './code-gen'

describe('randomCode', () => {
  it('returns 8 characters from the product alphabet', () => {
    for (let i = 0; i < 50; i++)
      expect(randomCode()).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/)
  })

  it('returns a different value on each call', () => {
    expect(new Set(Array.from({ length: 20 }, randomCode)).size).toBeGreaterThan(1)
  })
})
