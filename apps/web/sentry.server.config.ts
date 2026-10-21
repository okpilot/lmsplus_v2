import * as Sentry from '@sentry/nextjs'
import { SENTRY_DATA_COLLECTION } from './sentry-data-collection'
import { SENTRY_TOKEN_SCRUB } from './sentry-token-scrub'
import { tracesSampler } from './sentry-traces-sampler'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampler,
  ...SENTRY_TOKEN_SCRUB,
  dataCollection: SENTRY_DATA_COLLECTION,
  enabled: process.env.NODE_ENV === 'production',
})
