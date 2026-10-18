import * as Sentry from '@sentry/nextjs'
import { installTranslatorDomGuard } from './lib/translator-dom-guard'
import { scrubBreadcrumbTokens } from './sentry-breadcrumb-scrub'
import { SENTRY_DATA_COLLECTION } from './sentry-data-collection'

const SET_PASSWORD_PATH = '/auth/set-password'
const replay = () =>
  Sentry.replayIntegration({ maskAllText: true, maskAllInputs: true, blockAllMedia: true })

installTranslatorDomGuard((kind) => {
  Sentry.captureMessage(`translator-dom-guard tolerated a ${kind} mismatch`, 'warning')
})

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
  // Masking is the SDK default; pinned so a default change cannot unmask replays.
  // Replay records the raw page URL; it stays off while a live token_hash is in it.
  integrations: window.location.pathname === SET_PASSWORD_PATH ? [] : [replay()],
  beforeBreadcrumb: scrubBreadcrumbTokens,
  dataCollection: SENTRY_DATA_COLLECTION,
  enabled: process.env.NODE_ENV === 'production',
})

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
