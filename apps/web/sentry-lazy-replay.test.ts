import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDLE_TIMEOUT_MS, loadReplayAfterPaint, REPLAY_OPTIONS } from './sentry-lazy-replay'

const { replayIntegrationSpy, integration } = vi.hoisted(() => {
  const integration = { name: 'Replay' }
  return { integration, replayIntegrationSpy: vi.fn(() => integration) }
})

vi.mock('@sentry/replay', () => ({ replayIntegration: replayIntegrationSpy }))

async function flush() {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

function fakeSentry() {
  return { addIntegration: vi.fn(), captureException: vi.fn() }
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
    const sentry = fakeSentry()
    loadReplayAfterPaint(sentry)
    await vi.runAllTimersAsync()
    expect(sentry.addIntegration).not.toHaveBeenCalled()
    window.dispatchEvent(new Event('load'))
    await vi.runAllTimersAsync()
    await flush()
    expect(replayIntegrationSpy).toHaveBeenCalledWith(REPLAY_OPTIONS)
    expect(sentry.addIntegration).toHaveBeenCalledWith(integration)
  })

  it('does not wait for a load event when the document is already complete', async () => {
    setReadyState('complete')
    const sentry = fakeSentry()
    loadReplayAfterPaint(sentry)
    await vi.runAllTimersAsync()
    await flush()
    expect(sentry.addIntegration).toHaveBeenCalledWith(integration)
  })

  it('does not add replay before the browser is idle', async () => {
    setReadyState('complete')
    vi.stubGlobal(
      'requestIdleCallback',
      vi.fn((_cb: () => void, _opts?: IdleRequestOptions) => 0),
    )
    const sentry = fakeSentry()
    loadReplayAfterPaint(sentry)
    await vi.runAllTimersAsync()
    await flush()
    expect(sentry.addIntegration).not.toHaveBeenCalled()
  })

  it('falls back to a timer when idle callbacks are unsupported', async () => {
    setReadyState('complete')
    vi.stubGlobal('requestIdleCallback', undefined)
    const sentry = fakeSentry()
    loadReplayAfterPaint(sentry)
    await vi.runAllTimersAsync()
    await flush()
    expect(sentry.addIntegration).toHaveBeenCalledWith(integration)
  })

  it('passes a timeout so a busy main thread cannot postpone replay indefinitely', () => {
    setReadyState('complete')
    const idle = vi.fn((_cb: () => void, _opts?: IdleRequestOptions) => 0)
    vi.stubGlobal('requestIdleCallback', idle)
    loadReplayAfterPaint(fakeSentry())
    expect(idle).toHaveBeenCalledWith(expect.any(Function), { timeout: IDLE_TIMEOUT_MS })
  })

  it('warns, reports to Sentry and adds nothing when replay setup throws', async () => {
    setReadyState('complete')
    replayIntegrationSpy.mockImplementation(() => {
      throw new Error('setup failed')
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const sentry = fakeSentry()
    loadReplayAfterPaint(sentry)
    await vi.runAllTimersAsync()
    await flush()
    expect(sentry.addIntegration).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith('[sentry] replay failed to load or set up', expect.any(Error))
    expect(sentry.captureException).toHaveBeenCalledWith(expect.any(Error))
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
      const sentry = fakeSentry()
      load(sentry)
      await vi.runAllTimersAsync()
      await flush()
      expect(sentry.addIntegration).not.toHaveBeenCalled()
      expect(warn).toHaveBeenCalledWith(
        '[sentry] replay failed to load or set up',
        expect.any(Error),
      )
      expect(sentry.captureException).toHaveBeenCalledWith(expect.any(Error))
    } finally {
      vi.doMock('@sentry/replay', () => ({ replayIntegration: replayIntegrationSpy }))
    }
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
