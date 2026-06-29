import type { ReactNode } from 'react'

// Shared destructive alert used for both the active-exam and active-practice
// server-side lookup-failure notices on the quiz page.
function LookupAlert({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="mx-auto max-w-md rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
    >
      {children}
    </div>
  )
}

// Surfaces a clear, refreshable notice when either active-session lookup fails,
// so a `{ success: false }` result never collapses to a silent missing banner.
export function LookupErrorAlerts({
  examFailed,
  practiceFailed,
}: {
  examFailed: boolean
  practiceFailed: boolean
}) {
  return (
    <>
      {examFailed && (
        <LookupAlert>
          We couldn&apos;t check for active Practice Exams right now. Please refresh — if the issue
          persists, contact support.
        </LookupAlert>
      )}
      {practiceFailed && (
        <LookupAlert>
          We couldn&apos;t check for an unfinished practice session right now. Please refresh — if
          the issue persists, contact support.
        </LookupAlert>
      )}
    </>
  )
}
