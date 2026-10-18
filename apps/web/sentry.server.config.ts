import * as Sentry from '@sentry/nextjs'
import { SENTRY_DATA_COLLECTION } from './sentry-data-collection'
import { SENTRY_TOKEN_SCRUB } from './sentry-token-scrub'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,
  ...SENTRY_TOKEN_SCRUB,
  dataCollection: SENTRY_DATA_COLLECTION,
  enabled: process.env.NODE_ENV === 'production',
})
