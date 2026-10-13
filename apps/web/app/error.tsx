'use client'

import { CircleX } from 'lucide-react'
import { useBoundaryError } from '@/app/_hooks/use-boundary-error'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'

export default function ErrorPage({
  error,
  retry,
}: Readonly<{
  error: Error & { digest?: string }
  retry: () => void
}>) {
  useBoundaryError(error)

  return (
    <div className="grid min-h-[50vh] place-items-center px-gutter">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CircleX aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle as="h2">Something went wrong</EmptyTitle>
          <EmptyDescription>An unexpected error occurred.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button type="button" onClick={() => retry()}>
            Try again
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  )
}
