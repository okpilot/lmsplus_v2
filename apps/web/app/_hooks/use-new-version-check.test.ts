import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POLL_INTERVAL_MS, useNewVersionCheck } from './use-new-version-check'

type PollOpts = { isSuppressed: () => boolean; onNewVersion: () => void; intervalMs: number }

const { mockStart, mockStop, mockPathname } = vi.hoisted(() => ({
  mockStart: vi.fn(),
  mockStop: vi.fn(),
  mockPathname: vi.fn(),
}))

vi.mock('next/navigation', () => ({ usePathname: mockPathname }))
vi.mock('@/lib/deployment-version', async () => ({
  ...(await vi.importActual<typeof import('@/lib/deployment-version')>('@/lib/deployment-version')),
  startVersionPolling: mockStart,
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

  it('shows nothing while the deployment is unchanged', () => {
    const { result } = renderHook(() => useNewVersionCheck())
    expect(result.current.prompt).toBe('none')
  })

  it('opens the dialog when a new version is reported', () => {
    const { result } = renderHook(() => useNewVersionCheck())
    act(() => polling().onNewVersion())
    expect(result.current.prompt).toBe('dialog')
  })

  it('falls back to the banner after the user chooses later', () => {
    const { result } = renderHook(() => useNewVersionCheck())
    act(() => polling().onNewVersion())
    act(() => result.current.later())
    expect(result.current.prompt).toBe('banner')
  })

  it('suppresses further checks once a new version is detected', () => {
    renderHook(() => useNewVersionCheck())
    expect(polling().isSuppressed()).toBe(false)
    act(() => polling().onNewVersion())
    expect(polling().isSuppressed()).toBe(true)
  })

  it('suppresses checks on a live quiz session page', () => {
    mockPathname.mockReturnValue('/app/quiz/session/abc')
    renderHook(() => useNewVersionCheck())
    expect(polling().isSuppressed()).toBe(true)
  })

  it('shows nothing on a live session and resumes the dialog after leaving', () => {
    const { result, rerender } = renderHook(() => useNewVersionCheck())
    act(() => polling().onNewVersion())

    mockPathname.mockReturnValue('/app/quiz/session/abc')
    rerender()
    expect(result.current.prompt).toBe('none')

    mockPathname.mockReturnValue('/app/dashboard')
    rerender()
    expect(result.current.prompt).toBe('dialog')
  })

  it('resumes the banner after leaving a live session', () => {
    const { result, rerender } = renderHook(() => useNewVersionCheck())
    act(() => polling().onNewVersion())
    act(() => result.current.later())

    mockPathname.mockReturnValue('/app/quiz/session/abc')
    rerender()
    expect(result.current.prompt).toBe('none')

    mockPathname.mockReturnValue('/app/dashboard')
    rerender()
    expect(result.current.prompt).toBe('banner')
  })

  it('reloads the page on reload', () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    const { result } = renderHook(() => useNewVersionCheck())
    result.current.reload()
    expect(reload).toHaveBeenCalledOnce()
    vi.unstubAllGlobals()
  })

  it('stops polling on unmount', () => {
    const { unmount } = renderHook(() => useNewVersionCheck())
    unmount()
    expect(mockStop).toHaveBeenCalledOnce()
  })
})
