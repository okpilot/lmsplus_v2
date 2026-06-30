import { describe, expect, it } from 'vitest'
import { parseInternalExamsSearchParams } from './_search-params'

describe('parseInternalExamsSearchParams', () => {
  it('keeps a recognised code status', () => {
    expect(parseInternalExamsSearchParams({ status: 'consumed' }).status).toBe('consumed')
    expect(parseInternalExamsSearchParams({ status: 'finished' }).status).toBe('finished')
  })

  it('drops an unrecognised status to undefined', () => {
    expect(parseInternalExamsSearchParams({ status: 'bogus' }).status).toBeUndefined()
  })

  it('drops an array-valued status to undefined', () => {
    expect(parseInternalExamsSearchParams({ status: ['active', 'voided'] }).status).toBeUndefined()
  })

  it('defaults both page numbers to 1 when absent', () => {
    const result = parseInternalExamsSearchParams({})
    expect(result.codesPage).toBe(1)
    expect(result.attemptsPage).toBe(1)
  })

  it('parses the two table pages independently', () => {
    const result = parseInternalExamsSearchParams({ codesPage: '3', attemptsPage: '5' })
    expect(result.codesPage).toBe(3)
    expect(result.attemptsPage).toBe(5)
  })

  it('falls back to page 1 for an out-of-range page value', () => {
    expect(parseInternalExamsSearchParams({ codesPage: '0' }).codesPage).toBe(1)
    expect(parseInternalExamsSearchParams({ attemptsPage: '-2' }).attemptsPage).toBe(1)
  })
})
