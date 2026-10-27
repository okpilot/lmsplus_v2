'use client'

import Link from 'next/link'
import { ErrorScreen } from '@/app/_components/error-screen'
import { useBoundaryError } from '@/app/_hooks/use-boundary-error'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'

export default function AdminErrorPage({
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
          <Link href="/app/dashboard" className={buttonVariants({ variant: 'outline' })}>
            Back to dashboard
          </Link>
        </>
      }
    >
      An unexpected error occurred in the admin area.
    </ErrorScreen>
  )
}
