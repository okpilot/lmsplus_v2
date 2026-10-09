import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'
import { isStaleDeploymentError, reloadOnceForStaleDeployment } from '@/lib/stale-deployment'

export function useBoundaryError(error: Error) {
  useEffect(() => {
    if (isStaleDeploymentError(error) && reloadOnceForStaleDeployment()) return
    Sentry.captureException(error)
  }, [error])
}
