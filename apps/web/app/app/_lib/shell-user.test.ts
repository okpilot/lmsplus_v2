import { describe, expect, it } from 'vitest'
import { firstName } from './shell-user'

describe('firstName', () => {
  it('returns the first word of a full name', () => {
    expect(firstName('Jane Doe')).toBe('Jane')
  })

  it('ignores leading and repeated whitespace', () => {
    expect(firstName('  Jane   Doe')).toBe('Jane')
  })

  it('returns null for a blank name', () => {
    expect(firstName('   ')).toBeNull()
  })

  it('returns a single-word name unchanged', () => {
    expect(firstName('Jane')).toBe('Jane')
  })
})
