import { describe, expect, it } from 'vitest'
import { normalizeAnswer } from './normalize-answer'

describe('normalizeAnswer', () => {
  it.each([
    ['', ''],
    ['  hi  ', 'hi'],
    ['a-b_c', 'a b c'],
    ['a--b__c', 'a b c'],
    ['foo, bar!', 'foo bar'],
    ['HELLO World', 'hello world'],
    ['a   b', 'a b'],
  ])('normalizes %j to %j', (input, expected) => {
    expect(normalizeAnswer(input)).toBe(expected)
  })

  it.each([
    ['.'],
    [','],
    [';'],
    [':'],
    ['!'],
    ['?'],
    ['"'],
    ["'"],
    ['('],
    [')'],
    ['['],
    [']'],
  ])('strips the %j punctuation character', (punct) => {
    expect(normalizeAnswer(`a${punct}b`)).toBe('ab')
  })

  // The SQL grader (migration 101 `normalize_answer`) relies on Postgres lower(),
  // which preserves diacritics under UTF-8 rather than folding them to ASCII.
  // This TS normalizer must match: 'Čačak' lowercases to 'čačak', never 'cacak'.
  it('preserves diacritics rather than folding them to ASCII', () => {
    expect(normalizeAnswer('Čačak')).toBe('čačak')
  })
})
