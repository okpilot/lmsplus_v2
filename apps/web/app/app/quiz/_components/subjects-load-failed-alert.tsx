'use client'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

export function SubjectsLoadFailedAlert({ onRetry }: Readonly<{ onRetry: () => void }>) {
  return (
    <Alert tone="danger" role="alert">
      <AlertDescription>Quiz subjects could not be loaded.</AlertDescription>
      <Button type="button" onClick={onRetry}>
        Try again
      </Button>
    </Alert>
  )
}
