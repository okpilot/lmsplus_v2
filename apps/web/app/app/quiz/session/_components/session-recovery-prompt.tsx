'use client'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

type SessionRecoveryPromptProps = Readonly<{
  subjectName?: string
  answeredCount: number
  totalCount: number
  onResume: () => void
  onSave: () => void
  onDiscard: () => void
  loading: boolean
  error: string | null
}>

export function SessionRecoveryPrompt({
  subjectName,
  answeredCount,
  totalCount,
  onResume,
  onSave,
  onDiscard,
  loading,
  error,
}: SessionRecoveryPromptProps) {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-lg border border-border bg-card p-6 shadow-sm">
      <h2 className="text-base font-semibold text-foreground">Resume your quiz?</h2>
      {subjectName && (
        <p className="mt-1 text-sm text-muted-foreground">You were answering {subjectName}.</p>
      )}
      <p className="mt-1 text-sm text-muted-foreground">
        {answeredCount} of {totalCount} questions answered
      </p>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onResume}
          disabled={loading}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          Resume
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={loading}
          className="rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
        >
          Save for Later
        </button>
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <button
                type="button"
                disabled={loading}
                className="rounded-lg border border-destructive/30 px-4 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
              />
            }
          >
            Discard
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Discard quiz session?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently discard your progress. You cannot undo this action.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={onDiscard}>
                Discard
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
