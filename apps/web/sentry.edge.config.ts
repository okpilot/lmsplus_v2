import * as Sentry from '@sentry/nextjs'
import { SENTRY_DATA_COLLECTION } from './sentry-data-collection'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,
  dataCollection: SENTRY_DATA_COLLECTION,
  enabled: process.env.NODE_ENV === 'production',
})
