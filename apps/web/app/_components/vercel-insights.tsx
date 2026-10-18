'use client'

import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import { scrubTokens } from '@/sentry-token-scrub'

/** Vercel Analytics + Speed Insights with one-time `token_hash` values scrubbed from event URLs. */
export function VercelInsights() {
  return (
    <>
      <Analytics beforeSend={scrubTokens} />
      <SpeedInsights beforeSend={scrubTokens} />
    </>
  )
}
