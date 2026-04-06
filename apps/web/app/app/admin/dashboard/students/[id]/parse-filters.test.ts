import { describe, expect, it } from 'vitest'
import { parseSessionFilters } from './parse-filters'

describe('parseSessionFilters', () => {
  it('returns all defaults when params is empty', () => {
    expect(parseSessionFilters({})).toEqual({
      range: '30d',
      page: 1,
      sort: 'date',
      dir: 'desc',
    })
  })

  // -- range --

  it('accepts valid range "7d"', () => {
    expect(parseSessionFilters({ range: '7d' }).range).toBe('7d')
  })

  it('accepts valid range "30d"', () => {
    expect(parseSessionFilters({ range: '30d' }).range).toBe('30d')
  })

  it('accepts valid range "90d"', () => {
    expect(parseSessionFilters({ range: '90d' }).range).toBe('90d')
  })

  it('accepts valid range "all"', () => {
    expect(parseSessionFilters({ range: 'all' }).range).toBe('all')
  })

  it('defaults range to "30d" when value is not a recognised option', () => {
    expect(parseSessionFilters({ range: 'bad' }).range).toBe('30d')
  })

  it('defaults range to "30d" when value is an array', () => {
    expect(parseSessionFilters({ range: ['7d', '30d'] }).range).toBe('30d')
  })

  it('defaults range to "30d" when value is undefined', () => {
    expect(parseSessionFilters({ range: undefined }).range).toBe('30d')
  })

  // -- page --

  it('parses a valid page number', () => {
    expect(parseSessionFilters({ page: '3' }).page).toBe(3)
  })

  it('defaults page to 1 when value is "0"', () => {
    expect(parseSessionFilters({ page: '0' }).page).toBe(1)
  })

  it('defaults page to 1 when value is negative', () => {
    expect(parseSessionFilters({ page: '-5' }).page).toBe(1)
  })

  it('defaults page to 1 when value is non-numeric', () => {
    expect(parseSessionFilters({ page: 'abc' }).page).toBe(1)
  })

  it('defaults page to 1 when value is an array', () => {
    expect(parseSessionFilters({ page: ['1', '2'] }).page).toBe(1)
  })

  it('defaults page to 1 when value is undefined', () => {
    expect(parseSessionFilters({ page: undefined }).page).toBe(1)
  })

  // -- sort --

  it('accepts all valid sort values', () => {
    const sortValues = ['date', 'subject', 'topic', 'mode', 'score', 'questions'] as const
    for (const sort of sortValues) {
      expect(parseSessionFilters({ sort }).sort).toBe(sort)
    }
  })

  it('defaults sort to "date" when value is not a recognised option', () => {
    expect(parseSessionFilters({ sort: 'invalid' }).sort).toBe('date')
  })

  it('defaults sort to "date" when value is an array', () => {
    expect(parseSessionFilters({ sort: ['date', 'score'] }).sort).toBe('date')
  })

  it('defaults sort to "date" when value is undefined', () => {
    expect(parseSessionFilters({ sort: undefined }).sort).toBe('date')
  })

  // -- dir --

  it('accepts valid dir "asc"', () => {
    expect(parseSessionFilters({ dir: 'asc' }).dir).toBe('asc')
  })

  it('accepts valid dir "desc"', () => {
    expect(parseSessionFilters({ dir: 'desc' }).dir).toBe('desc')
  })

  it('defaults dir to "desc" when value is not a recognised option', () => {
    expect(parseSessionFilters({ dir: 'up' }).dir).toBe('desc')
  })

  it('defaults dir to "desc" when value is an array', () => {
    expect(parseSessionFilters({ dir: ['asc', 'desc'] }).dir).toBe('desc')
  })

  it('defaults dir to "desc" when value is undefined', () => {
    expect(parseSessionFilters({ dir: undefined }).dir).toBe('desc')
  })

  // -- all valid values together --

  it('parses all valid params together', () => {
    expect(parseSessionFilters({ range: '90d', page: '2', sort: 'score', dir: 'asc' })).toEqual({
      range: '90d',
      page: 2,
      sort: 'score',
      dir: 'asc',
    })
  })
})
