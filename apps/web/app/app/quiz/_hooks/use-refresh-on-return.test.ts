import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRefresh } = vi.hoisted(() => ({ mockRefresh: vi.fn() }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
  usePathname: () => window.location.pathname,
}))

const QUIZ = '/app/quiz'

async function loadHook() {
  vi.resetModules()
  return (await import('./use-refresh-on-return')).useRefreshOnReturn
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state })
  document.dispatchEvent(new Event('visibilitychange'))
}

function popTo(path: string) {
  window.history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

beforeEach(() => {
  vi.resetAllMocks()
  window.history.pushState({}, '', QUIZ)
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
})

describe('useRefreshOnReturn — tab visibility', () => {
  it('refreshes once when the document becomes visible', async () => {
    const useRefreshOnReturn = await loadHook()
    renderHook(() => useRefreshOnReturn())

    await act(async () => setVisibility('visible'))

    expect(mockRefresh).toHaveBeenCalledTimes(1)
  })

  it('does not refresh when the document becomes hidden', async () => {
    const useRefreshOnReturn = await loadHook()
    renderHook(() => useRefreshOnReturn())

    await act(async () => setVisibility('hidden'))

    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it('refreshes once for two visible events before the transition settles', async () => {
    const useRefreshOnReturn = await loadHook()
    renderHook(() => useRefreshOnReturn())

    await act(async () => {
      setVisibility('visible')
      setVisibility('visible')
    })

    expect(mockRefresh).toHaveBeenCalledTimes(1)
  })

  it('stops listening after unmount', async () => {
    const useRefreshOnReturn = await loadHook()
    const { unmount } = renderHook(() => useRefreshOnReturn())
    unmount()

    await act(async () => setVisibility('visible'))

    expect(mockRefresh).not.toHaveBeenCalled()
  })
})

describe('useRefreshOnReturn — Back/Forward', () => {
  async function installListener() {
    const useRefreshOnReturn = await loadHook()
    renderHook(() => useRefreshOnReturn()).unmount()
    return useRefreshOnReturn
  }

  it('refreshes once on mount after a popstate that landed on its pathname', async () => {
    const useRefreshOnReturn = await installListener()
    await act(async () => popTo(QUIZ))

    renderHook(() => useRefreshOnReturn())
    await act(async () => undefined)

    expect(mockRefresh).toHaveBeenCalledTimes(1)
  })

  it('does not refresh on a mount with no popstate', async () => {
    const useRefreshOnReturn = await installListener()

    renderHook(() => useRefreshOnReturn())
    await act(async () => undefined)

    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it('does not refresh on mount after a popstate to another path', async () => {
    const useRefreshOnReturn = await installListener()
    await act(async () => popTo('/app/progress'))
    window.history.pushState({}, '', QUIZ)

    renderHook(() => useRefreshOnReturn())
    await act(async () => undefined)

    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it('refreshes only once per recorded popstate', async () => {
    const useRefreshOnReturn = await installListener()
    await act(async () => popTo(QUIZ))
    renderHook(() => useRefreshOnReturn()).unmount()
    mockRefresh.mockClear()

    renderHook(() => useRefreshOnReturn())
    await act(async () => undefined)

    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it('ignores a popstate that happens while the hook is mounted', async () => {
    const useRefreshOnReturn = await loadHook()
    const first = renderHook(() => useRefreshOnReturn())
    await act(async () => popTo(QUIZ))
    first.unmount()
    mockRefresh.mockClear()

    renderHook(() => useRefreshOnReturn())
    await act(async () => undefined)

    expect(mockRefresh).not.toHaveBeenCalled()
  })
})
