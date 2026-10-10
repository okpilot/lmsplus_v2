'use server'

import { cookies } from 'next/headers'
import { DEPLOYMENT_PIN_COOKIE } from '@/lib/deployment-pin'
import { LIVE_SESSION_PREFIX } from '@/lib/deployment-version'

/** Clear the __vdpl cookie so subsequent requests use the latest deployment. */
export async function clearDeploymentPin() {
  const cookieStore = await cookies()
  cookieStore.delete({ name: DEPLOYMENT_PIN_COOKIE, path: LIVE_SESSION_PREFIX })
}
