'use client'

import { ErrorScreen } from '@/app/_components/error-screen'
import { useBoundaryError } from '@/app/_hooks/use-boundary-error'
import { Button } from '@/components/ui/button'

export default function QuizError({
  error,
  retry,
}: Readonly<{
  error: Error & { digest?: string }
  retry: () => void
}>) {
  useBoundaryError(error)

  return (
    <ErrorScreen
      action={
        <Button type="button" onClick={() => retry()}>
          Try again
        </Button>
      }
    >
      This quiz page could not be loaded.
    </ErrorScreen>
  )
}
