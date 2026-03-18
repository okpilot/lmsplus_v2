import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSidebar } from './use-sidebar'

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value
    }),
    clear: () => {
      store = {}
    },
  }
})()

Object.defineProperty(window, 'localStorage', { value: localStorageMock, writable: true })

beforeEach(() => {
  localStorageMock.clear()
  vi.clearAllMocks()
})

describe('useSidebar', () => {
  it('defaults to expanded (collapsed=false) when localStorage is empty', async () => {
    const { result } = renderHook(() => useSidebar())
    await act(async () => {})
    expect(result.current.collapsed).toBe(false)
  })

  it('reads collapsed=true from localStorage after hydration', async () => {
    localStorageMock.setItem('sidebar-collapsed', 'true')

    const { result } = renderHook(() => useSidebar())

    await act(async () => {})

    expect(result.current.collapsed).toBe(true)
  })

  it('toggle flips collapsed state and persists to localStorage', async () => {
    const { result } = renderHook(() => useSidebar())

    await act(async () => {})

    expect(result.current.collapsed).toBe(false)

    act(() => {
      result.current.toggle()
    })

    expect(result.current.collapsed).toBe(true)
    expect(localStorageMock.setItem).toHaveBeenCalledWith('sidebar-collapsed', 'true')

    act(() => {
      result.current.toggle()
    })

    expect(result.current.collapsed).toBe(false)
    expect(localStorageMock.setItem).toHaveBeenCalledWith('sidebar-collapsed', 'false')
  })
})
