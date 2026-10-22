import { addIntegration, captureException, isEnabled } from '@sentry/nextjs'
import { afterPageLoad } from '@/lib/utils/after-page-load'

// Masking is the SDK default; pinned so a default change cannot unmask replays.
export const REPLAY_OPTIONS = Object.freeze({
  maskAllText: true,
  maskAllInputs: true,
  blockAllMedia: true,
})

/**
 * Loads Replay out of the first-load bundle once the page has loaded and the browser is idle.
 */
export function loadReplayAfterPageLoad(): void {
  // `addIntegration` sets up even on a disabled client; `init` does not.
  if (!isEnabled()) return
  afterPageLoad(() => {
    // Not `lazyLoadIntegration`: it fetches from browser.sentry-cdn.com, which CSP `script-src 'self'` blocks.
    import('@sentry/replay')
      .then(({ replayIntegration }) => addIntegration(replayIntegration(REPLAY_OPTIONS)))
      .catch((error: unknown) => {
        console.warn('[sentry] replay failed to load or set up', error)
        captureException(error)
      })
  })
}
