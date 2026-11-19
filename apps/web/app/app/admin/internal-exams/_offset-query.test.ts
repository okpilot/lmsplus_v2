import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@repo/db/admin', () => ({ adminClient: { from: vi.fn() } }))

import {
  type OffsetChainBuilder,
  runOffsetCount,
  runOffsetPage,
  runOffsetRows,
} from './_offset-query'

const ctx = { tag: 'tag', failMessage: 'Failed generic' }

function builder(result: unknown): OffsetChainBuilder {
  return {
    // biome-ignore lint/suspicious/noThenProperty: thenable stands in for a PostgREST builder
    then: (resolve: (v: unknown) => void) => resolve(result),
  } as unknown as OffsetChainBuilder
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('runOffsetCount', () => {
  it('returns the count', async () => {
    expect(await runOffsetCount(builder({ count: 7, error: null }), ctx)).toBe(7)
  })
  it('returns 0 when count is null', async () => {
    expect(await runOffsetCount(builder({ count: null, error: null }), ctx)).toBe(0)
  })
  it('throws the generic message and logs the raw error', async () => {
    await expect(
      runOffsetCount(builder({ count: null, error: { message: 'raw' } }), ctx),
    ).rejects.toThrow('Failed generic')
    expect(console.error).toHaveBeenCalledWith('[tag] count error:', 'raw')
  })
})

describe('runOffsetRows', () => {
  it('returns the rows', async () => {
    expect(await runOffsetRows(builder({ data: [{ a: 1 }], error: null }), ctx)).toEqual([{ a: 1 }])
  })
  it('degrades a non-array payload to []', async () => {
    expect(await runOffsetRows(builder({ data: { a: 1 }, error: null }), ctx)).toEqual([])
  })
  it('throws the generic message on error', async () => {
    await expect(
      runOffsetRows(builder({ data: null, error: { message: 'raw' } }), ctx),
    ).rejects.toThrow('Failed generic')
    expect(console.error).toHaveBeenCalledWith('[tag] DB error:', 'raw')
  })
})

describe('runOffsetPage', () => {
  it('returns rows and count when in range', async () => {
    expect(await runOffsetPage(builder({ data: [1, 2], count: 5, error: null }), ctx)).toEqual({
      rows: [1, 2],
      count: 5,
      pastEnd: false,
    })
  })
  it('flags pastEnd with count 0 on PGRST103', async () => {
    expect(
      await runOffsetPage(
        builder({ data: null, count: null, error: { message: 'r', code: 'PGRST103' } }),
        ctx,
      ),
    ).toEqual({ rows: [], count: 0, pastEnd: true })
  })
  it('flags pastEnd carrying the count when rows are empty but count is positive', async () => {
    expect(await runOffsetPage(builder({ data: [], count: 4, error: null }), ctx)).toEqual({
      rows: [],
      count: 4,
      pastEnd: true,
    })
  })
  it('does not flag pastEnd for a genuinely empty set', async () => {
    expect(await runOffsetPage(builder({ data: [], count: 0, error: null }), ctx)).toEqual({
      rows: [],
      count: 0,
      pastEnd: false,
    })
  })
  it('throws the generic message on other errors', async () => {
    await expect(
      runOffsetPage(
        builder({ data: null, count: null, error: { message: 'raw', code: 'X' } }),
        ctx,
      ),
    ).rejects.toThrow('Failed generic')
  })
})
