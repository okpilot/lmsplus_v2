'use client'

type ExpiredNoticeProps = {
  submitting: boolean
  countdown: number
}

export function ExpiredNotice({ submitting, countdown }: Readonly<ExpiredNoticeProps>) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      className="mt-3 rounded-lg border border-red-400/40 bg-red-500/10 p-4"
    >
      <p className="text-sm font-medium text-red-600 dark:text-red-400">
        Time expired! Your answers will be submitted automatically.
      </p>
      {!submitting && countdown > 0 && (
        <p className="mt-1 text-xs text-muted-foreground">Auto-submitting in {countdown}s...</p>
      )}
    </div>
  )
}
