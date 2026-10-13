'use client'

import { ErrorScreen } from '@/app/_components/error-screen'
import { useBoundaryError } from '@/app/_hooks/use-boundary-error'
import { Button } from '@/components/ui/button'

export default function AppError({
  error,
  retry,
}: Readonly<{
  error: Error & { digest?: string }
  retry: () => void
}>) {
  useBoundaryError(error)

  return (
    <div className="grid min-h-[50vh] place-items-center px-gutter">
      <ErrorScreen
        action={
          <Button type="button" onClick={() => retry()}>
            Try again
          </Button>
        }
      >
        An unexpected error occurred.
      </ErrorScreen>
    </div>
  )
}
