import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useMediaQuery } from './use-media-query'

type Listener = () => void
function stubMatchMedia(initial: boolean) {
  let matches = initial
  const listeners = new Set<Listener>()
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      media: query,
      get matches() {
        return matches
      },
      addEventListener: (_: string, l: Listener) => listeners.add(l),
      removeEventListener: (_: string, l: Listener) => listeners.delete(l),
    })),
  )
  return (next: boolean) => {
    matches = next
    for (const l of listeners) l()
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('useMediaQuery', () => {
  it('returns the current match', () => {
    stubMatchMedia(true)
    const { result } = renderHook(() => useMediaQuery('(max-width: 639px)'))
    expect(result.current).toBe(true)
  })

  it('updates when the query changes', () => {
    const set = stubMatchMedia(false)
    const { result } = renderHook(() => useMediaQuery('(max-width: 639px)'))
    expect(result.current).toBe(false)
    act(() => set(true))
    expect(result.current).toBe(true)
  })

  it('passes the query to matchMedia', () => {
    stubMatchMedia(false)
    renderHook(() => useMediaQuery('(max-width: 639px)'))
    expect(window.matchMedia).toHaveBeenCalledWith('(max-width: 639px)')
  })

  it('returns false on the server snapshot', async () => {
    const { renderToString } = await import('react-dom/server')
    function Probe() {
      return <>{String(useMediaQuery('(max-width: 639px)'))}</>
    }
    stubMatchMedia(true)
    expect(renderToString(<Probe />)).toBe('false')
  })
})
