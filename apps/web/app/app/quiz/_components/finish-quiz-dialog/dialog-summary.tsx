'use client'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { FieldError } from '@/components/ui/field-error'
import { ExpiredNotice } from './expired-notice'

type DialogSummaryProps = {
  answeredCount: number
  totalQuestions: number
  submitting: boolean
  countdown: number
  isExam?: boolean
  timeExpired?: boolean
  pendingSelection?: boolean
}

export function DialogSummary({
  answeredCount,
  totalQuestions,
  submitting,
  countdown,
  isExam,
  timeExpired,
  pendingSelection,
}: Readonly<DialogSummaryProps>) {
  return (
    <>
      {timeExpired && isExam ? (
        <ExpiredNotice submitting={submitting} countdown={countdown} />
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          You have answered {answeredCount} of {totalQuestions} questions.
        </p>
      )}
      {pendingSelection && (
        <Alert tone="caution" size="compact" className="mt-3">
          <AlertDescription>
            You picked an answer on this question but haven't submitted it.
          </AlertDescription>
        </Alert>
      )}
    </>
  )
}

export function ErrorLine({ message }: Readonly<{ message?: string | null }>) {
  if (!message) return null
  return (
    <FieldError role="alert" className="mt-4">
      {message}
    </FieldError>
  )
}
