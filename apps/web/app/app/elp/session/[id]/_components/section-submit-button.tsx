'use client'

type Props = Readonly<{
  submitting: boolean
  error: string | null
  onSubmit: () => void
  disabled: boolean
}>

/** Renders the submit-error alert (if any) and the Submit Answer button.
 * Presentational only — submission state lives in `useSectionSubmit`. */
export function SectionSubmitButton({ submitting, error, onSubmit, disabled }: Props) {
  return (
    <>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={onSubmit}
        disabled={disabled}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {submitting ? 'Submitting…' : 'Submit Answer'}
      </button>
    </>
  )
}
