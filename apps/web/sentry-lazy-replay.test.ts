import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadReplayAfterPaint, REPLAY_OPTIONS } from './sentry-lazy-replay'

const { replayIntegrationSpy, integration } = vi.hoisted(() => {
  const integration = { name: 'Replay' }
  return { integration, replayIntegrationSpy: vi.fn(() => integration) }
})

vi.mock('@sentry/replay', () => ({ replayIntegration: replayIntegrationSpy }))

async function flush() {
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
    vi.stubGlobal('requestIdleCallback', (cb: () => void) => setTimeout(cb, 1))
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
    const addIntegration = vi.fn()
    loadReplayAfterPaint(addIntegration)
    await vi.runAllTimersAsync()
    expect(addIntegration).not.toHaveBeenCalled()
    window.dispatchEvent(new Event('load'))
    await vi.runAllTimersAsync()
    await flush()
    expect(replayIntegrationSpy).toHaveBeenCalledWith(REPLAY_OPTIONS)
    expect(addIntegration).toHaveBeenCalledWith(integration)
  })

  it('does not wait for a load event when the document is already complete', async () => {
    setReadyState('complete')
    const addIntegration = vi.fn()
    loadReplayAfterPaint(addIntegration)
    await vi.runAllTimersAsync()
    await flush()
    expect(addIntegration).toHaveBeenCalledWith(integration)
  })

  it('does not add replay before the browser is idle', async () => {
    setReadyState('complete')
    vi.stubGlobal('requestIdleCallback', vi.fn())
    const addIntegration = vi.fn()
    loadReplayAfterPaint(addIntegration)
    await vi.runAllTimersAsync()
    await flush()
    expect(addIntegration).not.toHaveBeenCalled()
  })

  it('falls back to a timer when idle callbacks are unsupported', async () => {
    setReadyState('complete')
    vi.stubGlobal('requestIdleCallback', undefined)
    const addIntegration = vi.fn()
    loadReplayAfterPaint(addIntegration)
    await vi.runAllTimersAsync()
    await flush()
    expect(addIntegration).toHaveBeenCalledWith(integration)
  })

  it('warns and adds nothing when the replay chunk fails to load', async () => {
    setReadyState('complete')
    replayIntegrationSpy.mockImplementation(() => {
      throw new Error('chunk failed')
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const addIntegration = vi.fn()
    loadReplayAfterPaint(addIntegration)
    await vi.runAllTimersAsync()
    await flush()
    expect(addIntegration).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalled()
  })

  it('does not throw when the client is disabled and adding is a no-op', async () => {
    setReadyState('complete')
    loadReplayAfterPaint(() => {})
    await vi.runAllTimersAsync()
    await flush()
    expect(replayIntegrationSpy).toHaveBeenCalledTimes(1)
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
