'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'
import { ErrorState } from '@/components/kit/error-state'
import { Button } from '@/components/ui/button'

export default function QuizSessionError({
  error,
  reset,
}: Readonly<{
  error: Error & { digest?: string }
  reset: () => void
}>) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <ErrorState action={<Button onClick={reset}>Try again</Button>}>
      This quiz could not be loaded.
    </ErrorState>
  )
}
