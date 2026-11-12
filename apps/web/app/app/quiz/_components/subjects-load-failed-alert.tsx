'use client'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

type SubjectsLoadFailedAlertProps = {
  onRetry: () => void
  pending?: boolean
}

export function SubjectsLoadFailedAlert({
  onRetry,
  pending,
}: Readonly<SubjectsLoadFailedAlertProps>) {
  return (
    <Alert tone="danger" role="alert">
      <AlertDescription>Quiz subjects could not be loaded.</AlertDescription>
      <Button type="button" onClick={onRetry} disabled={pending}>
        Try again
      </Button>
    </Alert>
  )
}
