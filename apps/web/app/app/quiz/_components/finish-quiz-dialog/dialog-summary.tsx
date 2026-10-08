'use client'

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
        <p className="mt-3 text-sm font-medium text-caution">
          You picked an answer on this question but haven't submitted it.
        </p>
      )}
    </>
  )
}

export function ErrorLine({ message }: Readonly<{ message: string }>) {
  return (
    <p role="alert" className="mt-4 text-sm text-destructive">
      {message}
    </p>
  )
}
