'use client'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

type ExpiredNoticeProps = {
  submitting: boolean
  countdown: number
}

export function ExpiredNotice({ submitting, countdown }: Readonly<ExpiredNoticeProps>) {
  return (
    <Alert tone="danger" role="alert" aria-live="assertive" aria-atomic="true" className="mt-3">
      <AlertTitle>Time expired! Your answers will be submitted automatically.</AlertTitle>
      {!submitting && countdown > 0 && (
        <AlertDescription className="text-muted-foreground!">
          Auto-submitting in {countdown}s...
        </AlertDescription>
      )}
    </Alert>
  )
}
