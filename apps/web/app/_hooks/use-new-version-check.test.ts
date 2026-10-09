import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POLL_INTERVAL_MS, useNewVersionCheck } from './use-new-version-check'

type PollOpts = { isSuppressed: () => boolean; onNewVersion: () => void; intervalMs: number }

const { mockStart, mockStop, mockShow, mockDismiss, mockPathname } = vi.hoisted(() => ({
  mockStart: vi.fn(),
  mockStop: vi.fn(),
  mockShow: vi.fn(),
  mockDismiss: vi.fn(),
  mockPathname: vi.fn(),
}))

vi.mock('next/navigation', () => ({ usePathname: mockPathname }))
vi.mock('@/lib/deployment-version', async () => ({
  ...(await vi.importActual<typeof import('@/lib/deployment-version')>('@/lib/deployment-version')),
  startVersionPolling: mockStart,
  showNewVersionToast: mockShow,
  dismissNewVersionToast: mockDismiss,
}))

function polling(): PollOpts {
  return mockStart.mock.calls[0]?.[0] as PollOpts
}

describe('useNewVersionCheck', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockPathname.mockReturnValue('/app/dashboard')
    mockStart.mockReturnValue(mockStop)
  })

  it('polls at the configured interval', () => {
    renderHook(() => useNewVersionCheck())
    expect(mockStart).toHaveBeenCalledOnce()
    expect(polling().intervalMs).toBe(POLL_INTERVAL_MS)
  })

  it('shows the toast when a new version is reported', () => {
    renderHook(() => useNewVersionCheck())
    polling().onNewVersion()
    expect(mockShow).toHaveBeenCalledOnce()
  })

  it('suppresses further checks once the toast is shown', () => {
    renderHook(() => useNewVersionCheck())
    expect(polling().isSuppressed()).toBe(false)
    polling().onNewVersion()
    expect(polling().isSuppressed()).toBe(true)
  })

  it('suppresses checks on a live quiz session page', () => {
    mockPathname.mockReturnValue('/app/quiz/session/abc')
    renderHook(() => useNewVersionCheck())
    expect(polling().isSuppressed()).toBe(true)
  })

  it('dismisses the toast on entering a live session and allows it again after leaving', () => {
    const { rerender } = renderHook(() => useNewVersionCheck())
    polling().onNewVersion()

    mockPathname.mockReturnValue('/app/quiz/session/abc')
    rerender()
    expect(mockDismiss).toHaveBeenCalledOnce()

    mockPathname.mockReturnValue('/app/dashboard')
    rerender()
    expect(polling().isSuppressed()).toBe(false)
  })

  it('stops polling on unmount', () => {
    const { unmount } = renderHook(() => useNewVersionCheck())
    unmount()
    expect(mockStop).toHaveBeenCalledOnce()
  })
})
