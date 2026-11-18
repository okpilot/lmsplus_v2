import { describe, expect, it } from 'vitest'
import { parseSittingParams } from './parse-sitting-params'
import { MAX_TICKS } from './types'

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

const U = (n: number) => `00000000-0000-4000-a000-${String(n).padStart(12, '0')}`

describe('parseSittingParams: popup params (AC 52)', () => {
  it.each(['people', 'exams', 'issue'])('keeps the dlg value %s', (dlg) => {
    expect(parseSittingParams({ dlg })).toMatchObject({ dlg })
  })

  it.each(['new', 'edit', 'bogus', ['people']])('ignores the dlg value %j', (dlg) => {
    expect(parseSittingParams({ dlg }).dlg).toBeUndefined()
  })

  it('reads valid, deduped uuid ids and drops non-uuids', () => {
    const r = parseSittingParams({ ids: `${U(1)},nope,${U(2)},${U(1)}` })
    expect(r.selection).toMatchObject({ present: true, all: false, ids: [U(1), U(2)] })
    expect(r.selection?.truncated).toBe(false)
  })

  it('keeps the first 100 ids and flags truncation', () => {
    const ids = Array.from({ length: 150 }, (_, i) => U(i + 1)).join(',')
    const r = parseSittingParams({ ids })
    expect(r.selection?.ids).toHaveLength(100)
    expect(r.selection?.ids[0]).toBe(U(1))
    expect(r.selection?.truncated).toBe(true)
  })

  it('ignores an ids string longer than 8192 characters', () => {
    const r = parseSittingParams({ ids: `${U(1)},${'a'.repeat(8200)}` })
    expect(r.selection?.ids ?? []).toEqual([])
  })

  it('ignores an array-valued ids', () => {
    expect(parseSittingParams({ ids: [U(1)] }).selection?.ids ?? []).toEqual([])
  })

  it('lets all=1 win over ids', () => {
    const r = parseSittingParams({ all: '1', ids: U(1) })
    expect(r.selection).toMatchObject({ present: true, all: true })
  })

  it('reports no selection when neither ids nor all is given', () => {
    expect(parseSittingParams({}).selection).toMatchObject({ present: false, all: false, ids: [] })
  })

  it('reads the people filters and defaults page to 1', () => {
    const r = parseSittingParams({
      pq: 'ann',
      pgroup: U(3),
      pcourse: U(4),
      pstatus: 'inactive',
      ppage: '2',
    })
    expect(r.people).toMatchObject({
      q: 'ann',
      group: U(3),
      course: U(4),
      status: 'inactive',
      page: 2,
    })
    expect(parseSittingParams({}).people?.page).toBe(1)
  })

  it('ignores invalid people filters', () => {
    const r = parseSittingParams({ pgroup: 'x', pcourse: 'y', pstatus: 'weird', ppage: '0' })
    expect(r.people?.group).toBeUndefined()
    expect(r.people?.course).toBeUndefined()
    expect(r.people?.status).toBeUndefined()
    expect(r.people?.page).toBe(1)
  })

  it('does not read a ret param', () => {
    expect(parseSittingParams({ ret: 'start' })).not.toHaveProperty('ret')
  })
})
