import type { addIntegration } from '@sentry/nextjs'

type Integration = Parameters<typeof addIntegration>[0]

// Masking is the SDK default; pinned so a default change cannot unmask replays.
export const REPLAY_OPTIONS = { maskAllText: true, maskAllInputs: true, blockAllMedia: true }

function afterLoad(run: () => void): void {
  if (document.readyState === 'complete') run()
  else window.addEventListener('load', run, { once: true })
}

function whenIdle(run: () => void): void {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run)
  else setTimeout(run, 0)
}

/** Loads Replay out of the first-load bundle, once the page has loaded and the browser is idle. */
export function loadReplayAfterPaint(addIntegration: (integration: Integration) => void): void {
  afterLoad(() =>
    whenIdle(() => {
      import('@sentry/replay')
        .then(({ replayIntegration }) => addIntegration(replayIntegration(REPLAY_OPTIONS)))
        .catch((error: unknown) => console.warn('[sentry] replay failed to load', error))
    }),
  )
}
