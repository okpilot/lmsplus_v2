'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
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
import { discardQuiz } from '../actions/discard'
import type { ActivePracticeSession } from '../actions/get-active-practice-session'

// Discard-only banner for an active practice session detected server-side.
// No Resume: practice answers live in localStorage, so a cross-browser session
// can't be restored — the only useful action is to clear it and start fresh.
export function ActivePracticeBanner({ session }: { session: ActivePracticeSession }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [discarded, setDiscarded] = useState(false)
  // Synchronous one-shot guard (code-style §6): a useState/isPending flag is async
  // and a double-trigger (dialog action + keypress) could both pass before commit.
  const discardingRef = useRef(false)

  if (discarded) return null

  async function handleDiscard() {
    if (discardingRef.current) return
    discardingRef.current = true
    setLoading(true)
    setError(null)
    try {
      const result = await discardQuiz({ sessionId: session.sessionId })
      if (result.success) {
        setDiscarded(true)
        router.refresh()
        return
      }
      setError(result.error ?? 'Failed to discard. Please try again.')
      discardingRef.current = false
    } catch {
      setError('Server unavailable. Please try again later.')
      discardingRef.current = false
    } finally {
      setLoading(false)
    }
  }

  const modeLabel = MODE_LABELS[session.mode]

  return (
    <div className="mx-auto max-w-md rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 mb-4">
      <p className="text-sm font-medium text-foreground">Unfinished {modeLabel} session</p>
      <p className="mt-1 text-xs text-muted-foreground">
        You have an unfinished {modeLabel} session for {session.subjectName}. Discard it to start
        something new.
      </p>
      <div className="mt-3 flex gap-2">
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
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction variant="destructive" disabled={loading} onClick={handleDiscard}>
                Discard
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
