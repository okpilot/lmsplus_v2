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

export default function QuizSessionError({
  error,
  retry,
}: Readonly<{
  error: Error & { digest?: string }
  retry: () => void
}>) {
  useBoundaryError(error)

  return (
    <Empty role="alert">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <CircleX aria-hidden="true" className="text-danger" />
        </EmptyMedia>
        <EmptyTitle as="h2">Something went wrong</EmptyTitle>
        <EmptyDescription>This quiz could not be loaded.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button type="button" onClick={() => retry()}>
          Try again
        </Button>
      </EmptyContent>
    </Empty>
  )
}
