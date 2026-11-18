import { describe, expect, it } from 'vitest'
import { MAX_TICKS, parseSittingParams } from './parse-sitting-params'

describe('parseSittingParams', () => {
  it('defaults to no query, show all and page 1', () => {
    expect(parseSittingParams({})).toMatchObject({ show: 'all', page: 1 })
    expect(parseSittingParams({}).q).toBeUndefined()
  })

  it('caps ticks at 100', () => {
    expect(MAX_TICKS).toBe(100)
  })

  it('reads a valid q, show and page', () => {
    expect(parseSittingParams({ q: 'ann', show: 'needs_code', page: '3' })).toMatchObject({
      q: 'ann',
      show: 'needs_code',
      page: 3,
    })
    expect(parseSittingParams({ show: 'attempts' }).show).toBe('attempts')
  })

  it.each(['not_emailed', 'has_attempts', 'bogus', ''])('ignores the show value %j', (show) => {
    expect(parseSittingParams({ show }).show).toBe('all')
  })

  it.each(['0', '-1', 'x', '1.5', ''])('ignores the page value %j', (page) => {
    expect(parseSittingParams({ page }).page).toBe(1)
  })

  it('ignores a q longer than 100 characters', () => {
    expect(parseSittingParams({ q: 'a'.repeat(101) }).q).toBeUndefined()
  })

  it('ignores array-valued params', () => {
    const r = parseSittingParams({ q: ['a', 'b'], show: ['needs_code'], page: ['2'] })
    expect(r.q).toBeUndefined()
    expect(r.show).toBe('all')
    expect(r.page).toBe(1)
  })
})
