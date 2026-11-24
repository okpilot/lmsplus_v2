'use client'

import Link from 'next/link'
import { ErrorScreen } from '@/app/_components/error-screen'
import { useBoundaryError } from '@/app/_hooks/use-boundary-error'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'

export default function SittingError({
  error,
  retry,
}: Readonly<{
  error: Error & { digest?: string }
  retry: () => void
}>) {
  useBoundaryError(error)

  return (
    <ErrorScreen
      actionClassName="sm:flex-row"
      action={
        <>
          <Button type="button" onClick={() => retry()}>
            Try again
          </Button>
          <Link
            href="/app/admin/internal-exams?tab=sittings"
            className={buttonVariants({ variant: 'outline' })}
          >
            Back to sittings
          </Link>
        </>
      }
    >
      Failed to load this sitting.
    </ErrorScreen>
  )
}
