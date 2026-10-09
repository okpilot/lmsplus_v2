'use client'

import Link from 'next/link'
import { useBoundaryError } from '@/app/_hooks/use-boundary-error'

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
      <div className="text-center space-y-4">
        <h2 className="text-2xl font-bold">Something went wrong</h2>
        <p className="text-muted-foreground">An unexpected error occurred in the admin area.</p>
        <div className="flex gap-3 justify-center">
          <button
            type="button"
            onClick={() => retry()}
            className="rounded-md bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
          >
            Try again
          </button>
          <Link href="/app/dashboard" className="rounded-md border px-4 py-2 hover:bg-muted">
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
