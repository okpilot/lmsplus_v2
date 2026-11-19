import { describe, expect, it } from 'vitest'
import { quoteOrValue } from './quote-or-value'

describe('quoteOrValue', () => {
  it('wraps the value in double quotes so , ( ) stay literal in an or() filter', () => {
    expect(quoteOrValue('a,b(c)')).toBe('"a,b(c)"')
  })

  it('escapes backslashes and double quotes', () => {
    expect(quoteOrValue(String.raw`a\b"c`)).toBe(String.raw`"a\\b\"c"`)
  })
})
