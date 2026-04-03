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
import { useQuizRecovery } from '../_hooks/use-quiz-recovery'

export function QuizRecoveryBanner({ userId }: { userId: string }) {
  const { session, loading, error, handleResume, handleSave, handleDiscard } =
    useQuizRecovery(userId)

  if (session === null) return null

  const answeredCount = Object.keys(session.answers).length
  const totalCount = session.questionIds.length

  return (
    <div className="mx-auto max-w-md rounded-lg border border-primary/30 bg-primary/5 p-4 mb-4">
      <p className="text-sm font-medium text-foreground">Unfinished quiz found</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {session.subjectName ? `${session.subjectName} — ` : ''}
        {answeredCount} of {totalCount} questions answered
      </p>
      {error && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={handleResume}
          disabled={loading}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          Resume
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={loading}
          className="rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
        >
          {loading ? 'Saving...' : 'Save for Later'}
        </button>
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <button
                type="button"
                disabled={loading}
                className="rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
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
              <AlertDialogAction variant="destructive" onClick={handleDiscard}>
                Discard
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
