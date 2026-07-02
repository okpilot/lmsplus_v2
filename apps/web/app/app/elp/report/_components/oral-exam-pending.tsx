type Props = Readonly<{ state: 'grading' | 'failed'; sessionId?: string }>

/**
 * Shown on the report route while a submitted section is still being scored, or
 * when scoring failed. `grading` auto-refreshes via a server-rendered meta-refresh
 * (no client polling — code-style.md §6) so the page re-fetches session status
 * every 5s until the report is ready.
 */
export function OralExamPending({ state, sessionId }: Props) {
  if (state === 'failed') {
    return (
      <div
        data-session-id={sessionId}
        className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center"
      >
        <h1 className="font-semibold text-lg">Scoring failed</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We couldn&apos;t score your answer. Please start over.
        </p>
        <a
          href="/app/elp"
          className="mt-4 inline-block text-sm font-medium text-primary underline underline-offset-4"
        >
          Back to §1 Interview Practice
        </a>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6 text-center">
      <meta httpEquiv="refresh" content="5" />
      <h1 className="font-semibold text-lg">Scoring your answer&hellip;</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        This usually takes under a minute. This page will refresh automatically.
      </p>
      <a
        href={`/app/elp/report/${sessionId ?? ''}`}
        className="mt-4 inline-block text-sm font-medium text-primary underline underline-offset-4"
      >
        Refresh now
      </a>
    </div>
  )
}
