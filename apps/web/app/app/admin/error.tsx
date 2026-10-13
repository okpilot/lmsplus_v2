'use client'

import Link from 'next/link'
import { useBoundaryError } from '@/app/_hooks/use-boundary-error'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'

export default function AdminErrorPage({
  error,
  retry,
}: Readonly<{
  error: Error & { digest?: string }
  retry: () => void
}>) {
  useBoundaryError(error)

  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Empty>
        <EmptyHeader>
          <EmptyTitle as="h2">Something went wrong</EmptyTitle>
          <EmptyDescription>An unexpected error occurred in the admin area.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="sm:flex-row">
          <Button type="button" onClick={() => retry()}>
            Try again
          </Button>
          <Link href="/app/dashboard" className={buttonVariants({ variant: 'outline' })}>
            Back to dashboard
          </Link>
        </EmptyContent>
      </Empty>
    </div>
  )
}
