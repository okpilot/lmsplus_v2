import { describe, expect, it } from 'vitest'
import { initials } from './initials'

describe('initials', () => {
  it('uses the first letters of the first two words in upper case', () => {
    expect(initials('ada pilot')).toBe('AP')
    expect(initials('Ada Maria Pilot')).toBe('AM')
  })

  it('uses a single letter for a single word', () => {
    expect(initials('Ada')).toBe('A')
    expect(initials('Unknown')).toBe('U')
  })

  it('uses the first letter of an email address', () => {
    expect(initials('ada@example.com')).toBe('A')
  })

  it('treats a name containing @ as one letter', () => {
    expect(initials('ada pilot@example.com')).toBe('A')
  })

  it('splits on tabs and runs of whitespace', () => {
    expect(initials('ada\tpilot')).toBe('AP')
    expect(initials('ada   pilot')).toBe('AP')
  })

  it('falls back to a question mark for blank, null or undefined', () => {
    expect(initials('')).toBe('?')
    expect(initials('   ')).toBe('?')
    expect(initials('  ')).toBe('?')
    expect(initials(null)).toBe('?')
    expect(initials(undefined)).toBe('?')
  })
})
