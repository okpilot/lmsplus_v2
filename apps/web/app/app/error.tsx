'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'
import { ErrorState } from '@/components/kit/error-state'
import { Button } from '@/components/ui/button'

export default function AppError({
  error,
  retry,
}: Readonly<{
  error: Error & { digest?: string }
  retry: () => void
}>) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <ErrorState action={<Button onClick={retry}>Try again</Button>}>
      An unexpected error occurred.
    </ErrorState>
  )
}
