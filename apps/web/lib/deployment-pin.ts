import type { User } from '@supabase/supabase-js'
import type { NextRequest, NextResponse } from 'next/server'
import { isLiveSessionPath, LIVE_SESSION_PREFIX } from './deployment-version'

export const DEPLOYMENT_PIN_COOKIE = '__vdpl'
const DEPLOYMENT_PIN_MAX_AGE_SECONDS = 8 * 60 * 60

/**
 * Pins quiz session pages to the current deployment (Skew Protection). A Server Action elsewhere
 * expires the pin so the next quiz pins the current build; a leftover site-wide pin is expired.
 */
export function syncDeploymentPin(opts: {
  pathname: string
  user: User | null
  request: NextRequest
  response: NextResponse
}): void {
  const { pathname, user, request, response } = opts
  const hasPin = request.cookies.has(DEPLOYMENT_PIN_COOKIE)
  if (!isLiveSessionPath(pathname)) {
    if (hasPin) response.cookies.delete(DEPLOYMENT_PIN_COOKIE)
    else if (request.headers.has('next-action')) {
      response.cookies.delete({ name: DEPLOYMENT_PIN_COOKIE, path: LIVE_SESSION_PREFIX })
    }
    return
  }
  const deploymentId = process.env.VERCEL_DEPLOYMENT_ID
  if (!user || !deploymentId || hasPin) return
  response.cookies.set(DEPLOYMENT_PIN_COOKIE, deploymentId, {
    path: LIVE_SESSION_PREFIX,
    maxAge: DEPLOYMENT_PIN_MAX_AGE_SECONDS,
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
  })
}
