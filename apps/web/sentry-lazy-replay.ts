import { addIntegration, captureException } from '@sentry/nextjs'

// Masking is the SDK default; pinned so a default change cannot unmask replays.
export const REPLAY_OPTIONS = { maskAllText: true, maskAllInputs: true, blockAllMedia: true }

// A hung subresource can keep `load` from firing.
export const LOAD_TIMEOUT_MS = 10_000

// A busy main thread can postpone an idle callback indefinitely.
export const IDLE_TIMEOUT_MS = 3000

function afterLoad(run: () => void): void {
  if (document.readyState === 'complete') {
    run()
    return
  }
  let done = false
  const once = () => {
    if (done) return
    done = true
    run()
  }
  window.addEventListener('load', once, { once: true })
  setTimeout(once, LOAD_TIMEOUT_MS)
}

function whenIdle(run: () => void): void {
  if (typeof requestIdleCallback === 'function')
    requestIdleCallback(run, { timeout: IDLE_TIMEOUT_MS })
  else setTimeout(run, 0)
}

/** Loads Replay out of the first-load bundle, once the page has loaded and the browser is idle. */
export function loadReplayAfterPaint(): void {
  afterLoad(() =>
    whenIdle(() => {
      import('@sentry/replay')
        .then(({ replayIntegration }) => addIntegration(replayIntegration(REPLAY_OPTIONS)))
        .catch((error: unknown) => {
          console.warn('[sentry] replay failed to load or set up', error)
          captureException(error)
        })
    }),
  )
}
