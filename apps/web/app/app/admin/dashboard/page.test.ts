import { describe, expect, it } from 'vitest'
import { parseFilters } from './parse-filters'

describe('parseFilters', () => {
  // range
  it('defaults range to "30d" when param is missing', () => {
    expect(parseFilters({}).range).toBe('30d')
  })

  it('accepts "7d" as a valid range', () => {
    expect(parseFilters({ range: '7d' }).range).toBe('7d')
  })

  it('accepts "30d" as a valid range', () => {
    expect(parseFilters({ range: '30d' }).range).toBe('30d')
  })

  it('accepts "90d" as a valid range', () => {
    expect(parseFilters({ range: '90d' }).range).toBe('90d')
  })

  it('accepts "all" as a valid range', () => {
    expect(parseFilters({ range: 'all' }).range).toBe('all')
  })

  it('defaults range to "30d" for an unrecognised value', () => {
    expect(parseFilters({ range: '1y' }).range).toBe('30d')
  })

  it('defaults range to "30d" when an array is passed', () => {
    expect(parseFilters({ range: ['7d', '90d'] }).range).toBe('30d')
  })

  // page
  it('defaults page to 1 when param is missing', () => {
    expect(parseFilters({}).page).toBe(1)
  })

  it('parses a valid positive integer page param', () => {
    expect(parseFilters({ page: '5' }).page).toBe(5)
  })

  it('defaults page to 1 for zero', () => {
    expect(parseFilters({ page: '0' }).page).toBe(1)
  })

  it('defaults page to 1 for a negative number string', () => {
    expect(parseFilters({ page: '-3' }).page).toBe(1)
  })

  it('defaults page to 1 for a non-numeric page string', () => {
    expect(parseFilters({ page: 'abc' }).page).toBe(1)
  })

  it('truncates a float page param to its integer part', () => {
    expect(parseFilters({ page: '2.9' }).page).toBe(2)
  })

  it('defaults page to 1 when an array is passed for page', () => {
    expect(parseFilters({ page: ['1', '2'] }).page).toBe(1)
  })

  // sort
  it('defaults sort to "name" when param is missing', () => {
    expect(parseFilters({}).sort).toBe('name')
  })

  it('accepts "name" as a valid sort value', () => {
    expect(parseFilters({ sort: 'name' }).sort).toBe('name')
  })

  it('accepts "lastActive" as a valid sort value', () => {
    expect(parseFilters({ sort: 'lastActive' }).sort).toBe('lastActive')
  })

  it('accepts "sessions" as a valid sort value', () => {
    expect(parseFilters({ sort: 'sessions' }).sort).toBe('sessions')
  })

  it('accepts "avgScore" as a valid sort value', () => {
    expect(parseFilters({ sort: 'avgScore' }).sort).toBe('avgScore')
  })

  it('accepts "mastery" as a valid sort value', () => {
    expect(parseFilters({ sort: 'mastery' }).sort).toBe('mastery')
  })

  it('defaults sort to "name" for an unrecognised value', () => {
    expect(parseFilters({ sort: 'unknown' }).sort).toBe('name')
  })

  it('defaults sort to "name" when an array is passed', () => {
    expect(parseFilters({ sort: ['name', 'mastery'] }).sort).toBe('name')
  })

  // dir
  it('defaults dir to "asc" when param is missing', () => {
    expect(parseFilters({}).dir).toBe('asc')
  })

  it('accepts "asc" as a valid dir value', () => {
    expect(parseFilters({ dir: 'asc' }).dir).toBe('asc')
  })

  it('accepts "desc" as a valid dir value', () => {
    expect(parseFilters({ dir: 'desc' }).dir).toBe('desc')
  })

  it('defaults dir to "asc" for an unrecognised value', () => {
    expect(parseFilters({ dir: 'ascending' }).dir).toBe('asc')
  })

  it('defaults dir to "asc" when an array is passed', () => {
    expect(parseFilters({ dir: ['asc'] }).dir).toBe('asc')
  })

  // status
  it('returns undefined for status when param is missing', () => {
    expect(parseFilters({}).status).toBeUndefined()
  })

  it('accepts "active" as a valid status value', () => {
    expect(parseFilters({ status: 'active' }).status).toBe('active')
  })

  it('accepts "inactive" as a valid status value', () => {
    expect(parseFilters({ status: 'inactive' }).status).toBe('inactive')
  })

  it('returns undefined for an unrecognised status value', () => {
    expect(parseFilters({ status: 'pending' }).status).toBeUndefined()
  })

  it('returns undefined for status when an array is passed', () => {
    expect(parseFilters({ status: ['active'] }).status).toBeUndefined()
  })

  // all defaults together
  it('returns all defaults when called with an empty params object', () => {
    expect(parseFilters({})).toEqual({
      range: '30d',
      page: 1,
      sort: 'name',
      dir: 'asc',
      status: undefined,
    })
  })
})
