import type { init } from '@sentry/nextjs'

type DataCollection = NonNullable<NonNullable<Parameters<typeof init>[0]>['dataCollection']>

/** Shared by the client, server and edge Sentry configs: no IP, cookies or HTTP bodies leave the app. */
export const SENTRY_DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  // Substrings matching every IP-carrying header Sentry reads (@sentry/core vendor/getIpAddress.js)
  // and every Vercel header (IP, geolocation, TLS fingerprint, region).
  httpHeaders: { deny: ['forwarded', 'client-ip', 'connecting-ip', 'real-ip', 'x-vercel-'] },
  httpBodies: [],
} satisfies DataCollection
