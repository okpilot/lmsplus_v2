'use client'

import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { MODE_LABELS } from '@/lib/constants/exam-modes'
import { useActivePracticeDiscard } from '../_hooks/use-active-practice-discard'
import type { ActivePracticeSession } from '../actions/get-active-practice-session'
import { ActivePracticeDiscardDialog } from './active-practice-discard-dialog'
import { ResumeLink } from './resume-exam-banner'

// Banner for an active practice session detected server-side. Resume opens the session
// page, which loads the answers from the server; Discard clears the session.
// `userId` is required (not optional) so a caller cannot silently skip clearing the legacy
// localStorage entry — matching ResumeExamBanner.
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
    <Alert tone="caution" className="mx-auto mb-4 max-w-md">
      <AlertTitle>Unfinished {modeLabel} session</AlertTitle>
      <AlertDescription>
        You have an unfinished {modeLabel} session for {session.subjectName}. Resume it, or discard
        it to start something new.
      </AlertDescription>
      <AlertAction className="flex gap-2">
        <ResumeLink sessionId={session.sessionId} loading={loading}>
          Resume
        </ResumeLink>
        <ActivePracticeDiscardDialog
          modeLabel={modeLabel}
          loading={loading}
          error={error}
          onDiscard={discard}
          onClearError={clearError}
        />
      </AlertAction>
    </Alert>
  )
}
