import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LOAD_TIMEOUT_MS } from '@/lib/utils/after-page-load'
import { loadReplayAfterPageLoad, REPLAY_OPTIONS } from './sentry-lazy-replay'

const { replayIntegrationSpy, integration, addIntegration, captureException, isEnabled } =
  vi.hoisted(() => {
    const integration = { name: 'Replay' }
    return {
      integration,
      replayIntegrationSpy: vi.fn(() => integration),
      addIntegration: vi.fn(),
      captureException: vi.fn(),
      isEnabled: vi.fn(),
    }
  })

vi.mock('@sentry/replay', () => ({ replayIntegration: replayIntegrationSpy }))
vi.mock('@sentry/nextjs', () => ({ addIntegration, captureException, isEnabled }))

async function flush() {
  await vi.dynamicImportSettled()
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

function setReadyState(state: DocumentReadyState) {
  vi.spyOn(document, 'readyState', 'get').mockReturnValue(state)
}

describe('loading Sentry Replay after the page has loaded', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    replayIntegrationSpy.mockReturnValue(integration)
    isEnabled.mockReturnValue(true)
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
    loadReplayAfterPageLoad()
    await vi.advanceTimersByTimeAsync(LOAD_TIMEOUT_MS - 1)
    expect(addIntegration).not.toHaveBeenCalled()
    window.dispatchEvent(new Event('load'))
    await vi.runAllTimersAsync()
    await flush()
    expect(replayIntegrationSpy).toHaveBeenCalledWith(REPLAY_OPTIONS)
    expect(addIntegration).toHaveBeenCalledWith(integration)
  })

  it('does not load replay when Sentry is disabled or has no DSN', async () => {
    isEnabled.mockReturnValue(false)
    setReadyState('complete')
    loadReplayAfterPageLoad()
    await vi.runAllTimersAsync()
    await flush()
    expect(replayIntegrationSpy).not.toHaveBeenCalled()
    expect(addIntegration).not.toHaveBeenCalled()
  })

  it('warns, reports to Sentry and adds nothing when the replay chunk fails to load', async () => {
    setReadyState('complete')
    vi.resetModules()
    vi.doMock('@sentry/replay', () => {
      throw new Error('chunk failed')
    })
    try {
      const { loadReplayAfterPageLoad: load } = await import('./sentry-lazy-replay')
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
    loadReplayAfterPageLoad()
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
