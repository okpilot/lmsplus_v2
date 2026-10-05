'use client'

import Link from 'next/link'
import { MODE_LABELS } from '@/lib/constants/exam-modes'
import { useActivePracticeDiscard } from '../_hooks/use-active-practice-discard'
import type { ActivePracticeSession } from '../actions/get-active-practice-session'
import { ActivePracticeDiscardDialog } from './active-practice-discard-dialog'

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
        <ActivePracticeDiscardDialog
          modeLabel={modeLabel}
          loading={loading}
          error={error}
          onDiscard={discard}
          onClearError={clearError}
        />
      </div>
    </div>
  )
}
