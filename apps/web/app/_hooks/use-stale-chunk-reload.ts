import { useEffect } from 'react'
import { isStaleDeploymentError, reloadOnceForStaleDeployment } from '@/lib/stale-deployment'

export function useStaleChunkReload() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      if (isStaleDeploymentError(event.error)) reloadOnceForStaleDeployment()
    }
    const onRejection = (event: PromiseRejectionEvent) => {
      if (isStaleDeploymentError(event.reason)) reloadOnceForStaleDeployment()
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])
}
