import { describe, expect, it } from 'vitest'
import { plural } from './plural'

describe('plural', () => {
  it('uses the singular for 1', () => expect(plural(1, 'sitting')).toBe('1 sitting'))
  it('appends s for other counts', () => {
    expect(plural(0, 'sitting')).toBe('0 sittings')
    expect(plural(3, 'sitting')).toBe('3 sittings')
  })
  it('uses the explicit plural form', () => expect(plural(2, 'person', 'people')).toBe('2 people'))
})
