'use client'

import { useBoundaryError } from '@/app/_hooks/use-boundary-error'
import { ErrorState } from '@/components/kit/error-state'
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
    <ErrorState action={<Button onClick={() => retry()}>Try again</Button>}>
      An unexpected error occurred.
    </ErrorState>
  )
}
