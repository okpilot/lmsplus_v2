import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useStaleChunkReload } from './use-stale-chunk-reload'

const { mockReload } = vi.hoisted(() => ({ mockReload: vi.fn() }))

vi.mock('@/lib/stale-deployment', async () => ({
  ...(await vi.importActual<typeof import('@/lib/stale-deployment')>('@/lib/stale-deployment')),
  reloadOnceForStaleDeployment: mockReload,
}))

function rejection(reason: unknown) {
  const event = new Event('unhandledrejection') as Event & { reason: unknown }
  event.reason = reason
  return event
}

describe('useStaleChunkReload', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('reloads when a window error is a stale chunk failure', () => {
    renderHook(() => useStaleChunkReload())
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('Loading chunk 9 failed.') }))
    expect(mockReload).toHaveBeenCalledOnce()
  })

  it('reloads when a rejected promise is a stale chunk failure', () => {
    renderHook(() => useStaleChunkReload())
    window.dispatchEvent(rejection(new Error('Failed to fetch dynamically imported module: x')))
    expect(mockReload).toHaveBeenCalledOnce()
  })

  it('ignores unrelated errors', () => {
    renderHook(() => useStaleChunkReload())
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('nope') }))
    window.dispatchEvent(rejection('nope'))
    expect(mockReload).not.toHaveBeenCalled()
  })

  it('stops listening after unmount', () => {
    const { unmount } = renderHook(() => useStaleChunkReload())
    unmount()
    window.dispatchEvent(rejection(new Error('Loading chunk 9 failed.')))
    expect(mockReload).not.toHaveBeenCalled()
  })
})
