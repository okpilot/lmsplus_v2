'use client'

import { catchError, type ErrorInfo } from 'next/error'
import { useMemo } from 'react'
import { useBoundaryError } from '@/app/_hooks/use-boundary-error'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

function SubjectsErrorAlert({ error, retry }: Readonly<Pick<ErrorInfo, 'error' | 'retry'>>) {
  // Stable per thrown value, so a re-render does not report it again.
  const err = useMemo(() => (error instanceof Error ? error : new Error(String(error))), [error])
  useBoundaryError(err)

  return (
    <Alert tone="danger" role="alert">
      <AlertDescription>Quiz subjects could not be loaded.</AlertDescription>
      <Button type="button" onClick={() => retry()}>
        Try again
      </Button>
    </Alert>
  )
}

/** Keeps a subject-picker failure inside the New quiz tab; the rest of the quiz page renders. */
export default catchError((_props: Readonly<Record<never, never>>, { error, retry }: ErrorInfo) => (
  <SubjectsErrorAlert error={error} retry={retry} />
))
