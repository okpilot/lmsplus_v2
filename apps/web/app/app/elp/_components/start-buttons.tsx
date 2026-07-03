'use client'

type Props = Readonly<{
  onStart: (mode: 'practice' | 'mock') => void
  starting: boolean
  error: string | null
}>

/** ELP start screen shown when no session is in progress: heading, description,
 * error alert, and the two Start buttons. Presentational only — the start logic
 * and re-entry guard live in `ElpHome`. */
export function StartButtons({ onStart, starting, error }: Props) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">ICAO English Prep</h1>
      <p className="text-sm text-muted-foreground">
        Practice the §1 Interview, or sit the full 5-section Mock Exam — record your spoken answers
        and get scored feedback.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => onStart('practice')}
          disabled={starting}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {starting ? 'Starting…' : 'Start §1 Interview Practice'}
        </button>
        <button
          type="button"
          onClick={() => onStart('mock')}
          disabled={starting}
          className="rounded-md border border-primary px-4 py-2 text-sm font-medium text-primary disabled:opacity-50"
        >
          {starting ? 'Starting…' : 'Start Mock Exam'}
        </button>
      </div>
    </div>
  )
}
