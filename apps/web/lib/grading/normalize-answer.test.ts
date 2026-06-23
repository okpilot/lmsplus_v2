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
    // Final-trim cases (#921): punctuation adjacent to an edge space must not
    // leave a stray edge space, or grading penalizes a correct answer.
    ['. hello', 'hello'],
    ['hello .', 'hello'],
    ['. hello .', 'hello'],
    ['  .  hello  ', 'hello'],
    ['  .  ', ''],
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

  it('strips leading punctuation', () => {
    expect(normalizeAnswer('.hello')).toBe('hello')
  })

  it('strips trailing punctuation', () => {
    expect(normalizeAnswer('hello.')).toBe('hello')
  })

  it('collapses hyphens and underscores mixed with spaces into a single space', () => {
    expect(normalizeAnswer('a-b_c d')).toBe('a b c d')
  })

  it('strips adjacent punctuation characters without leaving extra spaces', () => {
    expect(normalizeAnswer('a.,b')).toBe('ab')
  })

  it('returns an empty string for an all-whitespace input', () => {
    expect(normalizeAnswer('   ')).toBe('')
  })

  it('preserves non-ASCII characters that are not diacritics (e.g. ñ, ï)', () => {
    expect(normalizeAnswer('Naïve')).toBe('naïve')
    expect(normalizeAnswer('Ñoño')).toBe('ñoño')
  })

  // A real radiotelephony answer like an ICAO location bracket: both brackets
  // must strip in one pass, matching the SQL grader's [ ] character-class.
  it('strips a bracketed token down to its inner text', () => {
    expect(normalizeAnswer('[LKPR]')).toBe('lkpr')
  })
})
