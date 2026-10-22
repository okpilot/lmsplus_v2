import { addIntegration, captureException } from '@sentry/nextjs'

// Masking is the SDK default; pinned so a default change cannot unmask replays.
export const REPLAY_OPTIONS = Object.freeze({
  maskAllText: true,
  maskAllInputs: true,
  blockAllMedia: true,
})

// A hung subresource can keep `load` from firing.
export const LOAD_TIMEOUT_MS = 10_000

// A busy main thread can postpone an idle callback indefinitely.
export const IDLE_TIMEOUT_MS = 3000

function afterLoad(run: () => void): void {
  if (document.readyState === 'complete') {
    run()
    return
  }
  const onLoad = () => {
    clearTimeout(timer)
    run()
  }
  const timer = setTimeout(() => {
    window.removeEventListener('load', onLoad)
    run()
  }, LOAD_TIMEOUT_MS)
  window.addEventListener('load', onLoad, { once: true })
}

function whenIdle(run: () => void): void {
  if (typeof requestIdleCallback === 'function')
    requestIdleCallback(run, { timeout: IDLE_TIMEOUT_MS })
  else setTimeout(run, 0)
}

/**
 * Loads Replay out of the first-load bundle after window load (or LOAD_TIMEOUT_MS), then on an
 * idle callback (or IDLE_TIMEOUT_MS; a plain timeout where requestIdleCallback is absent).
 */
export function loadReplayAfterPageLoad(): void {
  afterLoad(() =>
    whenIdle(() => {
      // Not `lazyLoadIntegration`: it fetches from browser.sentry-cdn.com, which CSP `script-src 'self'` blocks.
      import('@sentry/replay')
        .then(({ replayIntegration }) => addIntegration(replayIntegration(REPLAY_OPTIONS)))
        .catch((error: unknown) => {
          console.warn('[sentry] replay failed to load or set up', error)
          captureException(error)
        })
    }),
  )
}
