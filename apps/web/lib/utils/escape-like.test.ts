import { describe, expect, it } from 'vitest'
import { escapeLike } from './escape-like'

describe('escapeLike', () => {
  it('escapes a percent sign so it is matched literally, not as a wildcard', () => {
    expect(escapeLike('50%')).toBe('50\\%')
  })

  it('escapes an underscore so it is matched literally, not as a single-char wildcard', () => {
    expect(escapeLike('a_b')).toBe('a\\_b')
  })

  it('escapes a backslash so it is matched literally', () => {
    expect(escapeLike('a\\b')).toBe('a\\\\b')
  })

  it('leaves a value with no special characters unchanged', () => {
    expect(escapeLike('john.doe@example.com')).toBe('john.doe@example.com')
  })
})
