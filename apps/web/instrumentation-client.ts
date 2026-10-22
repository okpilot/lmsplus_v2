import * as Sentry from '@sentry/nextjs'
import { installTranslatorDomGuard } from './lib/translator-dom-guard'
import { SENTRY_DATA_COLLECTION } from './sentry-data-collection'
import { recordDocumentTiming } from './sentry-document-timing'
import { loadReplayAfterPaint } from './sentry-lazy-replay'
import { SENTRY_TOKEN_SCRUB } from './sentry-token-scrub'
import { clientTracesSampler } from './sentry-traces-sampler'

const SET_PASSWORD_PATH = '/auth/set-password'

installTranslatorDomGuard((kind) => {
  Sentry.captureMessage(`translator-dom-guard tolerated a ${kind} mismatch`, 'warning')
})

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampler: clientTracesSampler,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
  ...SENTRY_TOKEN_SCRUB,
  dataCollection: SENTRY_DATA_COLLECTION,
  enabled: process.env.NODE_ENV === 'production',
})

// Replay records the raw page URL; it stays off while a live token_hash is in it.
if (window.location.pathname !== SET_PASSWORD_PATH) {
  // Members, not the namespace: a namespace passed as a value can defeat tree-shaking of replay.
  loadReplayAfterPaint({
    addIntegration: Sentry.addIntegration,
    captureException: Sentry.captureException,
  })
}

recordDocumentTiming(Sentry.getClient())

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
