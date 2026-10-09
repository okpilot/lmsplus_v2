import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POLL_INTERVAL_MS, useNewVersionCheck } from './use-new-version-check'

const { mockFetch, mockShow, mockDismiss, mockPathname } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
  mockShow: vi.fn(),
  mockDismiss: vi.fn(),
  mockPathname: vi.fn(),
}))

vi.mock('next/navigation', () => ({ usePathname: mockPathname }))
vi.mock('@/lib/deployment-version', async () => ({
  ...(await vi.importActual<typeof import('@/lib/deployment-version')>('@/lib/deployment-version')),
  fetchDeploymentVersion: mockFetch,
  showNewVersionToast: mockShow,
  dismissNewVersionToast: mockDismiss,
}))

async function tick(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

describe('useNewVersionCheck', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers()
    mockPathname.mockReturnValue('/app/dashboard')
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the toast when the deployed version changes', async () => {
    mockFetch.mockResolvedValueOnce('v1').mockResolvedValue('v2')
    renderHook(() => useNewVersionCheck())
    await tick()
    await tick(POLL_INTERVAL_MS)
    expect(mockShow).toHaveBeenCalledOnce()
  })

  it('stays silent while the version is unchanged', async () => {
    mockFetch.mockResolvedValue('v1')
    renderHook(() => useNewVersionCheck())
    await tick()
    await tick(POLL_INTERVAL_MS * 3)
    expect(mockShow).not.toHaveBeenCalled()
  })

  it('shows the toast only once per change', async () => {
    mockFetch.mockResolvedValueOnce('v1').mockResolvedValue('v2')
    renderHook(() => useNewVersionCheck())
    await tick()
    await tick(POLL_INTERVAL_MS * 3)
    expect(mockShow).toHaveBeenCalledOnce()
  })

  it('does not poll when the baseline version is unavailable', async () => {
    mockFetch.mockResolvedValue(null)
    renderHook(() => useNewVersionCheck())
    await tick()
    await tick(POLL_INTERVAL_MS * 3)
    expect(mockFetch).toHaveBeenCalledOnce()
    expect(mockShow).not.toHaveBeenCalled()
  })

  it('does not check while the tab is hidden', async () => {
    mockFetch.mockResolvedValueOnce('v1').mockResolvedValue('v2')
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    renderHook(() => useNewVersionCheck())
    await tick()
    await tick(POLL_INTERVAL_MS * 2)
    expect(mockShow).not.toHaveBeenCalled()
  })

  it('checks when the tab becomes visible again', async () => {
    mockFetch.mockResolvedValueOnce('v1').mockResolvedValue('v2')
    renderHook(() => useNewVersionCheck())
    await tick()
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(mockShow).toHaveBeenCalledOnce()
  })

  it('does not show the toast on a live quiz session page', async () => {
    mockPathname.mockReturnValue('/app/quiz/session/abc')
    mockFetch.mockResolvedValueOnce('v1').mockResolvedValue('v2')
    renderHook(() => useNewVersionCheck())
    await tick()
    await tick(POLL_INTERVAL_MS * 2)
    expect(mockShow).not.toHaveBeenCalled()
  })

  it('dismisses the toast on entering a live session and shows it again after leaving', async () => {
    mockFetch.mockResolvedValueOnce('v1').mockResolvedValue('v2')
    const { rerender } = renderHook(() => useNewVersionCheck())
    await tick()
    await tick(POLL_INTERVAL_MS)
    expect(mockShow).toHaveBeenCalledOnce()

    mockPathname.mockReturnValue('/app/quiz/session/abc')
    rerender()
    expect(mockDismiss).toHaveBeenCalledOnce()

    mockPathname.mockReturnValue('/app/dashboard')
    rerender()
    await tick(POLL_INTERVAL_MS)
    expect(mockShow).toHaveBeenCalledTimes(2)
  })

  it('stops polling after unmount', async () => {
    mockFetch.mockResolvedValue('v1')
    const { unmount } = renderHook(() => useNewVersionCheck())
    await tick()
    unmount()
    await tick(POLL_INTERVAL_MS * 3)
    expect(mockFetch).toHaveBeenCalledOnce()
  })
})
