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

  it('reaches the whole alphabet at every position', () => {
    // Over 400 draws a live position misses 16 symbols with probability (16/32)**400, so a >16
    // floor cannot flake.
    const seen = Array.from({ length: 8 }, () => new Set<string>())
    for (let i = 0; i < 400; i++) {
      const code = randomCode()
      for (let p = 0; p < 8; p++) seen[p]?.add(code[p] as string)
    }
    for (let p = 0; p < 8; p++) expect(seen[p]?.size, `position ${p}`).toBeGreaterThan(16)
  })
})
