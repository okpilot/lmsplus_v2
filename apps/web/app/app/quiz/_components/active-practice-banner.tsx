'use client'

import Link from 'next/link'
import { useState } from 'react'
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
import { MODE_LABELS } from '@/lib/constants/exam-modes'
import { useActivePracticeDiscard } from '../_hooks/use-active-practice-discard'
import type { ActivePracticeSession } from '../actions/get-active-practice-session'

// Banner for an active practice session detected server-side. Resume opens the session
// page, which loads the answers from the server; Discard clears the session.
// `userId` is required (not optional) so a caller cannot silently skip the localStorage
// clear the discard depends on (until #1453) — matching ResumeExamBanner.
export function ActivePracticeBanner({
  userId,
  session,
}: Readonly<{ userId: string; session: ActivePracticeSession }>) {
  const { discard, loading, error, discarded, clearError } = useActivePracticeDiscard(
    session.sessionId,
    userId,
  )
  const [open, setOpen] = useState(false)

  if (discarded) return null

  const modeLabel = MODE_LABELS[session.mode]

  return (
    <div className="mx-auto max-w-md rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 mb-4">
      <p className="text-sm font-medium text-foreground">Unfinished {modeLabel} session</p>
      <p className="mt-1 text-xs text-muted-foreground">
        You have an unfinished {modeLabel} session for {session.subjectName}. Resume it, or discard
        it to start something new.
      </p>
      <div className="mt-3 flex gap-2">
        <Link
          href={`/app/quiz/session/${session.sessionId}`}
          className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600"
        >
          Resume
        </Link>
        <AlertDialog
          open={open}
          onOpenChange={(next) => {
            // Keep the dialog open while a discard is in flight so the confirm
            // can't be dismissed mid-request; clear any stale error on close.
            if (loading) return
            setOpen(next)
            if (!next) clearError()
          }}
        >
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
              <AlertDialogTitle>Discard {modeLabel} session?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently discard your {modeLabel} progress. You cannot undo this
                action.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {/* Render the error inside the dialog: the AlertDialogAction does not
                close the popup, so a banner-level alert would sit behind the overlay. */}
            {error && (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive" disabled={loading} onClick={discard}>
                Discard
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
