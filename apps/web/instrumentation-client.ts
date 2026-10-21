import * as Sentry from '@sentry/nextjs'
import { installTranslatorDomGuard } from './lib/translator-dom-guard'
import { SENTRY_DATA_COLLECTION } from './sentry-data-collection'
import { recordDocumentTiming } from './sentry-document-timing'
import { SENTRY_TOKEN_SCRUB } from './sentry-token-scrub'
import { clientTracesSampler } from './sentry-traces-sampler'

const SET_PASSWORD_PATH = '/auth/set-password'
const replay = () =>
  Sentry.replayIntegration({ maskAllText: true, maskAllInputs: true, blockAllMedia: true })

installTranslatorDomGuard((kind) => {
  Sentry.captureMessage(`translator-dom-guard tolerated a ${kind} mismatch`, 'warning')
})

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampler: clientTracesSampler,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
  // Masking is the SDK default; pinned so a default change cannot unmask replays.
  // Replay records the raw page URL; it stays off while a live token_hash is in it.
  integrations: window.location.pathname === SET_PASSWORD_PATH ? [] : [replay()],
  ...SENTRY_TOKEN_SCRUB,
  dataCollection: SENTRY_DATA_COLLECTION,
  enabled: process.env.NODE_ENV === 'production',
})

recordDocumentTiming(Sentry.getClient())

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
