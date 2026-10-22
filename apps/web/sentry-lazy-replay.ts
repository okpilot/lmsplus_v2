import type * as Sentry from '@sentry/nextjs'

type ReplaySentry = Pick<typeof Sentry, 'addIntegration' | 'captureException'>

// Masking is the SDK default; pinned so a default change cannot unmask replays.
export const REPLAY_OPTIONS = { maskAllText: true, maskAllInputs: true, blockAllMedia: true }

// A busy main thread can postpone an idle callback indefinitely.
export const IDLE_TIMEOUT_MS = 3000

function afterLoad(run: () => void): void {
  if (document.readyState === 'complete') run()
  else window.addEventListener('load', run, { once: true })
}

function whenIdle(run: () => void): void {
  if (typeof requestIdleCallback === 'function')
    requestIdleCallback(run, { timeout: IDLE_TIMEOUT_MS })
  else setTimeout(run, 0)
}

/** Loads Replay out of the first-load bundle, once the page has loaded and the browser is idle. */
export function loadReplayAfterPaint(sentry: ReplaySentry): void {
  afterLoad(() =>
    whenIdle(() => {
      import('@sentry/replay')
        .then(({ replayIntegration }) => sentry.addIntegration(replayIntegration(REPLAY_OPTIONS)))
        .catch((error: unknown) => {
          console.warn('[sentry] replay failed to load or set up', error)
          sentry.captureException(error)
        })
    }),
  )
}
