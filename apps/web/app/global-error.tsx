'use client'

import { useBoundaryError } from '@/app/_hooks/use-boundary-error'
import { Button } from '@/components/ui/button'

export default function GlobalError({
  error,
  retry,
}: Readonly<{
  error: Error & { digest?: string }
  retry: () => void
}>) {
  useBoundaryError(error)

  return (
    <html lang="en">
      <body>
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-center">
            <h1 className="text-title">Something went wrong</h1>
            <p className="mt-2 text-muted-foreground">
              An unexpected error occurred. Please try refreshing the page.
            </p>
            <Button type="button" onClick={() => retry()} className="mt-4">
              Try again
            </Button>
          </div>
        </div>
      </body>
    </html>
  )
}
