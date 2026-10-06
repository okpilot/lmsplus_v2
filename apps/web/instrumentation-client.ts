import * as Sentry from '@sentry/nextjs'
import { SENTRY_DATA_COLLECTION } from './sentry-data-collection'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
  // Masking is the SDK default; pinned so a default change cannot unmask replays.
  integrations: [
    Sentry.replayIntegration({ maskAllText: true, maskAllInputs: true, blockAllMedia: true }),
  ],
  dataCollection: SENTRY_DATA_COLLECTION,
  enabled: process.env.NODE_ENV === 'production',
})

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
