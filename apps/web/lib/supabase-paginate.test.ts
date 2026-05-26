import { describe, expect, it, vi } from 'vitest'
import { fetchAllRows } from './supabase-paginate'

describe('fetchAllRows', () => {
  it('returns all rows from a single page when the total fits in one page', async () => {
    const getCount = vi.fn().mockResolvedValue({ count: 3, error: null })
    const getPage = vi.fn().mockResolvedValue({ data: [1, 2, 3], error: null })

    const result = await fetchAllRows(getCount, getPage, 1000)

    expect(result.data).toEqual([1, 2, 3])
    expect(result.error).toBeNull()
    expect(getPage).toHaveBeenCalledOnce()
    expect(getPage).toHaveBeenCalledWith(0, 2)
  })

  it('accumulates rows across multiple pages', async () => {
    const getCount = vi.fn().mockResolvedValue({ count: 5, error: null })
    const getPage = vi
      .fn()
      .mockResolvedValueOnce({ data: [1, 2], error: null })
      .mockResolvedValueOnce({ data: [3, 4], error: null })
      .mockResolvedValueOnce({ data: [5], error: null })

    const result = await fetchAllRows(getCount, getPage, 2)

    expect(result.data).toEqual([1, 2, 3, 4, 5])
    expect(result.error).toBeNull()
    expect(getPage).toHaveBeenCalledTimes(3)
    expect(getPage).toHaveBeenNthCalledWith(1, 0, 1)
    expect(getPage).toHaveBeenNthCalledWith(2, 2, 3)
    expect(getPage).toHaveBeenNthCalledWith(3, 4, 4)
  })

  it('makes no out-of-range page request when total is an exact multiple of pageSize', async () => {
    const getCount = vi.fn().mockResolvedValue({ count: 4, error: null })
    const getPage = vi
      .fn()
      .mockResolvedValueOnce({ data: [1, 2], error: null })
      .mockResolvedValueOnce({ data: [3, 4], error: null })

    const result = await fetchAllRows(getCount, getPage, 2)

    expect(result.data).toEqual([1, 2, 3, 4])
    expect(result.error).toBeNull()
    expect(getPage).toHaveBeenCalledTimes(2)
    expect(getPage).toHaveBeenNthCalledWith(2, 2, 3)
  })

  it('returns empty data and makes no page calls when the count is zero', async () => {
    const getCount = vi.fn().mockResolvedValue({ count: 0, error: null })
    const getPage = vi.fn()

    const result = await fetchAllRows(getCount, getPage)

    expect(result.data).toEqual([])
    expect(result.error).toBeNull()
    expect(getPage).not.toHaveBeenCalled()
  })

  it('returns the count error without paging when the count query fails', async () => {
    const getCount = vi.fn().mockResolvedValue({ count: null, error: { message: 'count boom' } })
    const getPage = vi.fn()

    const result = await fetchAllRows(getCount, getPage)

    expect(result.data).toEqual([])
    expect(result.error).toEqual({ message: 'count boom' })
    expect(getPage).not.toHaveBeenCalled()
  })

  it('discards partial pages and returns the error when a page query fails mid-way', async () => {
    const getCount = vi.fn().mockResolvedValue({ count: 5, error: null })
    const getPage = vi
      .fn()
      .mockResolvedValueOnce({ data: [1, 2], error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'page boom' } })

    const result = await fetchAllRows(getCount, getPage, 2)

    // A half-fetched set must not masquerade as complete — return [] + the error, not [1,2].
    expect(result.data).toEqual([])
    expect(result.error).toEqual({ message: 'page boom' })
    expect(getPage).toHaveBeenCalledTimes(2)
  })

  it('treats a null count as zero', async () => {
    const getCount = vi.fn().mockResolvedValue({ count: null, error: null })
    const getPage = vi.fn()

    const result = await fetchAllRows(getCount, getPage)

    expect(result.data).toEqual([])
    expect(result.error).toBeNull()
    expect(getPage).not.toHaveBeenCalled()
  })
})
