'use client'

import { catchError, type ErrorInfo } from 'next/error'
import { useMemo } from 'react'
import { useBoundaryError } from '@/app/_hooks/use-boundary-error'
import { SubjectsLoadFailedAlert } from './subjects-load-failed-alert'

function SubjectsErrorAlert({ error, retry }: Readonly<Pick<ErrorInfo, 'error' | 'retry'>>) {
  // Stable per thrown value, so a re-render does not report it again.
  const err = useMemo(() => (error instanceof Error ? error : new Error(String(error))), [error])
  useBoundaryError(err)

  return <SubjectsLoadFailedAlert onRetry={() => retry()} />
}

/** Contains a SubjectsSection throw (an exam-subjects read) inside the New quiz tab; a subject-list failure is handled in the form. */
export default catchError((_props: Readonly<Record<never, never>>, { error, retry }: ErrorInfo) => (
  <SubjectsErrorAlert error={error} retry={retry} />
))
