import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockReplace = vi.hoisted(() => vi.fn())

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => '/app/admin/dashboard',
}))

import { useUpdateSearchParams } from './use-update-search-params'

describe('useUpdateSearchParams', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    Object.defineProperty(window, 'location', {
      value: { search: '' },
      writable: true,
    })
  })

  it('sets a param and calls router.replace with pathname', () => {
    const { result } = renderHook(() => useUpdateSearchParams())
    act(() => result.current({ page: '2' }))
    expect(mockReplace).toHaveBeenCalledWith('/app/admin/dashboard?page=2')
  })

  it('deletes a param when value is null', () => {
    Object.defineProperty(window, 'location', {
      value: { search: '?page=3&sort=name' },
      writable: true,
    })
    const { result } = renderHook(() => useUpdateSearchParams())
    act(() => result.current({ page: null }))
    expect(mockReplace).toHaveBeenCalledWith('/app/admin/dashboard?sort=name')
  })

  it('omits trailing ? when all params are deleted', () => {
    Object.defineProperty(window, 'location', {
      value: { search: '?page=2' },
      writable: true,
    })
    const { result } = renderHook(() => useUpdateSearchParams())
    act(() => result.current({ page: null }))
    expect(mockReplace).toHaveBeenCalledWith('/app/admin/dashboard')
  })

  it('reads from window.location.search at call time, not render time', () => {
    Object.defineProperty(window, 'location', {
      value: { search: '' },
      writable: true,
    })
    const { result } = renderHook(() => useUpdateSearchParams())

    // Simulate another component updating the URL between renders
    Object.defineProperty(window, 'location', {
      value: { search: '?range=7d' },
      writable: true,
    })

    act(() => result.current({ status: 'active' }))
    // Should include range=7d from the live URL, not lose it
    expect(mockReplace).toHaveBeenCalledWith('/app/admin/dashboard?range=7d&status=active')
  })

  it('handles multiple updates in a single call', () => {
    const { result } = renderHook(() => useUpdateSearchParams())
    act(() => result.current({ sort: 'name', dir: 'asc', page: null }))
    expect(mockReplace).toHaveBeenCalledWith('/app/admin/dashboard?sort=name&dir=asc')
  })
})
