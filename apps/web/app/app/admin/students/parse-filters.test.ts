import { describe, expect, it } from 'vitest'
import { parseFilters } from './parse-filters'

const GROUP = 'a0000000-0000-4000-8000-000000000001'

describe('parseFilters', () => {
  it('defaults to page 1 and no filters', () => {
    expect(parseFilters({})).toMatchObject({ page: 1 })
  })

  it('parses a positive page number', () => {
    expect(parseFilters({ page: '3' }).page).toBe(3)
  })

  it('falls back to page 1 on an invalid page', () => {
    expect(parseFilters({ page: '-2' }).page).toBe(1)
    expect(parseFilters({ page: 'abc' }).page).toBe(1)
  })

  it('keeps a valid group uuid', () => {
    expect(parseFilters({ group: GROUP }).group).toBe(GROUP)
  })

  it('ignores a group that is not a uuid', () => {
    expect(parseFilters({ group: 'not-a-uuid' }).group).toBeUndefined()
    expect(parseFilters({ group: ['x', GROUP] }).group).toBeUndefined()
  })

  it('trims search and drops an empty one', () => {
    expect(parseFilters({ search: '  alice  ' }).search).toBe('alice')
    expect(parseFilters({ search: '   ' }).search).toBeUndefined()
  })

  it('never returns a search longer than 200 characters', () => {
    const search = parseFilters({ search: 'a'.repeat(500) }).search
    expect((search ?? '').length).toBeLessThanOrEqual(200)
  })

  it('keeps valid status and role and ignores unknown values', () => {
    expect(parseFilters({ status: 'active', role: 'admin' })).toMatchObject({
      status: 'active',
      role: 'admin',
    })
    const bad = parseFilters({ status: 'x', role: 'root' })
    expect(bad.status).toBeUndefined()
    expect(bad.role).toBeUndefined()
  })
})
