import { describe, expect, it } from 'vitest'
import { isPastEndPage } from './past-end-page'

describe('isPastEndPage', () => {
  it('is true for PGRST103', () => {
    expect(isPastEndPage({ data: null, count: null, error: { code: 'PGRST103' } })).toBe(true)
  })

  it('is false for any other error code', () => {
    expect(isPastEndPage({ data: null, count: null, error: { code: 'PGRST301' } })).toBe(false)
    expect(isPastEndPage({ data: null, count: null, error: {} })).toBe(false)
  })

  it('is true for empty data with a positive count (offset == total)', () => {
    expect(isPastEndPage({ data: [], count: 50, error: null })).toBe(true)
  })

  it('is false for empty data with count 0', () => {
    expect(isPastEndPage({ data: [], count: 0, error: null })).toBe(false)
  })

  it('is false when count is null', () => {
    expect(isPastEndPage({ data: [], count: null, error: null })).toBe(false)
  })

  it('is false for non-array data', () => {
    expect(isPastEndPage({ data: null, count: 5, error: null })).toBe(false)
  })

  it('is false for a non-empty page', () => {
    expect(isPastEndPage({ data: [{ id: 'a' }], count: 5, error: null })).toBe(false)
  })
})
