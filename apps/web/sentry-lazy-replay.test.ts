import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  IDLE_TIMEOUT_MS,
  LOAD_TIMEOUT_MS,
  loadReplayAfterPaint,
  REPLAY_OPTIONS,
} from './sentry-lazy-replay'

const { replayIntegrationSpy, integration, addIntegration, captureException } = vi.hoisted(() => {
  const integration = { name: 'Replay' }
  return {
    integration,
    replayIntegrationSpy: vi.fn(() => integration),
    addIntegration: vi.fn(),
    captureException: vi.fn(),
  }
})

vi.mock('@sentry/replay', () => ({ replayIntegration: replayIntegrationSpy }))
vi.mock('@sentry/nextjs', () => ({ addIntegration, captureException }))

async function flush() {
  await vi.dynamicImportSettled()
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

function setReadyState(state: DocumentReadyState) {
  vi.spyOn(document, 'readyState', 'get').mockReturnValue(state)
}

describe('loading Sentry Replay after first paint', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    replayIntegrationSpy.mockReturnValue(integration)
    vi.useFakeTimers()
    vi.stubGlobal('requestIdleCallback', (cb: () => void, _opts?: IdleRequestOptions) =>
      setTimeout(cb, 1),
    )
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('masks all text and inputs and blocks media', () => {
    expect(REPLAY_OPTIONS).toEqual({ maskAllText: true, maskAllInputs: true, blockAllMedia: true })
  })

  it('adds the replay integration once the page has loaded and the browser is idle', async () => {
    setReadyState('loading')
    loadReplayAfterPaint()
    await vi.advanceTimersByTimeAsync(LOAD_TIMEOUT_MS - 1)
    expect(addIntegration).not.toHaveBeenCalled()
    window.dispatchEvent(new Event('load'))
    await vi.runAllTimersAsync()
    await flush()
    expect(replayIntegrationSpy).toHaveBeenCalledWith(REPLAY_OPTIONS)
    expect(addIntegration).toHaveBeenCalledWith(integration)
  })

  it('starts anyway when the load event never fires', async () => {
    setReadyState('loading')
    loadReplayAfterPaint()
    await vi.advanceTimersByTimeAsync(LOAD_TIMEOUT_MS)
    await vi.runAllTimersAsync()
    await flush()
    expect(addIntegration).toHaveBeenCalledWith(integration)
  })

  it('adds replay once when load fires before the load timeout', async () => {
    setReadyState('loading')
    loadReplayAfterPaint()
    window.dispatchEvent(new Event('load'))
    await vi.runAllTimersAsync()
    await flush()
    expect(addIntegration).toHaveBeenCalledTimes(1)
  })

  it('adds replay once when load fires after the load timeout', async () => {
    setReadyState('loading')
    loadReplayAfterPaint()
    await vi.advanceTimersByTimeAsync(LOAD_TIMEOUT_MS)
    window.dispatchEvent(new Event('load'))
    await vi.runAllTimersAsync()
    await flush()
    expect(addIntegration).toHaveBeenCalledTimes(1)
  })

  it('does not wait for a load event when the document is already complete', async () => {
    setReadyState('complete')
    loadReplayAfterPaint()
    await vi.runAllTimersAsync()
    await flush()
    expect(addIntegration).toHaveBeenCalledWith(integration)
  })

  it('does not add replay before the browser is idle', async () => {
    setReadyState('complete')
    vi.stubGlobal(
      'requestIdleCallback',
      vi.fn((_cb: () => void, _opts?: IdleRequestOptions) => 0),
    )
    loadReplayAfterPaint()
    await vi.runAllTimersAsync()
    await flush()
    expect(addIntegration).not.toHaveBeenCalled()
  })

  it('falls back to a timer when idle callbacks are unsupported', async () => {
    setReadyState('complete')
    vi.stubGlobal('requestIdleCallback', undefined)
    loadReplayAfterPaint()
    await vi.runAllTimersAsync()
    await flush()
    expect(addIntegration).toHaveBeenCalledWith(integration)
  })

  it('passes a timeout so a busy main thread cannot postpone replay indefinitely', () => {
    setReadyState('complete')
    const idle = vi.fn((_cb: () => void, _opts?: IdleRequestOptions) => 0)
    vi.stubGlobal('requestIdleCallback', idle)
    loadReplayAfterPaint()
    expect(idle).toHaveBeenCalledWith(expect.any(Function), { timeout: IDLE_TIMEOUT_MS })
  })

  it('warns, reports to Sentry and adds nothing when the replay chunk fails to load', async () => {
    setReadyState('complete')
    vi.resetModules()
    vi.doMock('@sentry/replay', () => {
      throw new Error('chunk failed')
    })
    try {
      const { loadReplayAfterPaint: load } = await import('./sentry-lazy-replay')
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      load()
      await vi.runAllTimersAsync()
      await flush()
      expect(addIntegration).not.toHaveBeenCalled()
      expect(warn).toHaveBeenCalledWith(
        '[sentry] replay failed to load or set up',
        expect.any(Error),
      )
      expect(captureException).toHaveBeenCalledWith(expect.any(Error))
    } finally {
      vi.doMock('@sentry/replay', () => ({ replayIntegration: replayIntegrationSpy }))
      vi.resetModules()
    }
  })

  it('warns, reports to Sentry and adds nothing when replay setup throws', async () => {
    setReadyState('complete')
    replayIntegrationSpy.mockImplementation(() => {
      throw new Error('setup failed')
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    loadReplayAfterPaint()
    await vi.runAllTimersAsync()
    await flush()
    expect(addIntegration).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith('[sentry] replay failed to load or set up', expect.any(Error))
    expect(captureException).toHaveBeenCalledWith(expect.any(Error))
  })
})

describe('installed Sentry packages', () => {
  it('resolves the same @sentry/replay version that @sentry/browser declares', () => {
    const fromWeb = createRequire(import.meta.url)
    const nextjs = createRequire(fromWeb.resolve('@sentry/nextjs/package.json'))
    const react = createRequire(nextjs.resolve('@sentry/react/package.json'))
    const browserPkg = react.resolve('@sentry/browser/package.json')
    const declared = createRequire(browserPkg)(browserPkg).dependencies['@sentry/replay']
    const installed = fromWeb('@sentry/replay/package.json').version
    expect(installed).toBe(declared)
  })
})
