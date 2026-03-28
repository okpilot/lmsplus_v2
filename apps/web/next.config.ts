import { withSentryConfig } from '@sentry/nextjs'
import type { NextConfig } from 'next'

const isDev = process.env.NODE_ENV !== 'production'
// Allow localhost connections in production builds that target local Supabase (E2E CI)
const isLocalSupabase = process.env.NEXT_PUBLIC_SUPABASE_URL?.startsWith('http://localhost')
const allowLocal = isDev || isLocalSupabase

const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' data: blob: https://*.supabase.co${allowLocal ? ' http://localhost:* http://127.0.0.1:*' : ''}`,
      "font-src 'self'",
      `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.ingest.de.sentry.io${allowLocal ? ' http://localhost:* http://127.0.0.1:* ws://localhost:*' : ''}`,
      "frame-ancestors 'none'",
    ].join('; '),
  },
]

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }]
  },
}

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG ?? 'just-me-pe',
  project: process.env.SENTRY_PROJECT ?? 'lmsplus-web',
  silent: !process.env.CI,
  widenClientFileUpload: true,
  tunnelRoute: '/monitoring',
  sourcemaps: {
    filesToDeleteAfterUpload: ['.next/static/**/*.map'],
  },
  disableLogger: true,
})
