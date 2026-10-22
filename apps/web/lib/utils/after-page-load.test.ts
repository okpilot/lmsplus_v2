import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { afterPageLoad, IDLE_TIMEOUT_MS, LOAD_TIMEOUT_MS } from './after-page-load'

function setReadyState(state: DocumentReadyState) {
  vi.spyOn(document, 'readyState', 'get').mockReturnValue(state)
}

describe('running work after the page has loaded', () => {
  const run = vi.fn()

  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers()
    vi.stubGlobal('requestIdleCallback', (cb: () => void, _opts?: IdleRequestOptions) =>
      setTimeout(cb, 1),
    )
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('runs once the page has loaded and the browser is idle', async () => {
    setReadyState('loading')
    afterPageLoad(run)
    await vi.advanceTimersByTimeAsync(LOAD_TIMEOUT_MS - 1)
    expect(run).not.toHaveBeenCalled()
    window.dispatchEvent(new Event('load'))
    await vi.runAllTimersAsync()
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('starts anyway when the load event never fires', async () => {
    setReadyState('loading')
    afterPageLoad(run)
    await vi.advanceTimersByTimeAsync(LOAD_TIMEOUT_MS)
    await vi.runAllTimersAsync()
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('runs once when load fires before the load timeout', async () => {
    setReadyState('loading')
    afterPageLoad(run)
    window.dispatchEvent(new Event('load'))
    await vi.runAllTimersAsync()
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('runs once when load fires after the load timeout', async () => {
    setReadyState('loading')
    afterPageLoad(run)
    await vi.advanceTimersByTimeAsync(LOAD_TIMEOUT_MS)
    window.dispatchEvent(new Event('load'))
    await vi.runAllTimersAsync()
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('does not wait for a load event when the document is already complete', async () => {
    setReadyState('complete')
    afterPageLoad(run)
    await vi.runAllTimersAsync()
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('does not run before the browser is idle', async () => {
    setReadyState('complete')
    const idle = vi.fn((_cb: () => void, _opts?: IdleRequestOptions) => 0)
    vi.stubGlobal('requestIdleCallback', idle)
    afterPageLoad(run)
    await vi.runAllTimersAsync()
    expect(run).not.toHaveBeenCalled()
    expect(idle).toHaveBeenCalledTimes(1)
    idle.mock.calls[0]?.[0]()
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('falls back to a timer when idle callbacks are unsupported', async () => {
    setReadyState('complete')
    vi.stubGlobal('requestIdleCallback', undefined)
    afterPageLoad(run)
    await vi.runAllTimersAsync()
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('passes a timeout so a busy main thread cannot postpone the work indefinitely', () => {
    setReadyState('complete')
    const idle = vi.fn((_cb: () => void, _opts?: IdleRequestOptions) => 0)
    vi.stubGlobal('requestIdleCallback', idle)
    afterPageLoad(run)
    expect(idle).toHaveBeenCalledWith(expect.any(Function), { timeout: IDLE_TIMEOUT_MS })
  })
})
