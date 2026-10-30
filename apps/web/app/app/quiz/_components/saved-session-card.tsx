'use client'

import { Button } from '@/components/ui/button'
import { CardListRow } from '@/components/ui/card'
import { FieldError } from '@/components/ui/field-error'
import { modeLabel } from '@/lib/constants/exam-modes'
import type { SavedQuizSession } from '@/lib/queries/load-saved-quizzes'
import { useSavedCardActions } from '../_hooks/use-saved-card-actions'
import { SavedSessionProgress } from './saved-session-progress'

type ButtonsProps = {
  resuming: boolean
  deleting: boolean
  onResume: () => void
  onDelete: () => void
}

function SavedSessionButtons({ resuming, deleting, onResume, onDelete }: Readonly<ButtonsProps>) {
  const busy = resuming || deleting
  return (
    <div className="flex shrink-0 gap-2">
      <Button
        type="button"
        variant="outline"
        data-testid="resume-saved-session"
        onClick={onResume}
        disabled={busy}
        aria-busy={resuming || undefined}
      >
        {resuming ? 'Resuming...' : 'Resume'}
      </Button>
      <Button
        type="button"
        variant="outline"
        data-testid="delete-saved-session"
        onClick={onDelete}
        disabled={busy}
      >
        {deleting ? 'Deleting...' : 'Delete'}
      </Button>
    </div>
  )
}

/** A server-saved quiz: Resume reopens the same session id, Delete clears the saved marker. */
export function SavedSessionCard({ session }: Readonly<{ session: SavedQuizSession }>) {
  const { error, resuming, resume, deleting, remove } = useSavedCardActions(session.sessionId)

  return (
    <CardListRow className="flex flex-col gap-3 lg:grid lg:grid-cols-(--layout-saved-row) lg:items-center lg:gap-x-section">
      <div className="min-w-0">
        <p className="truncate text-label">{session.subjectName}</p>
        <p className="text-caption text-muted-foreground">{modeLabel(session.mode)}</p>
      </div>
      <SavedSessionProgress answered={session.answeredCount} total={session.totalCount} />
      <SavedSessionButtons
        resuming={resuming}
        deleting={deleting}
        onResume={resume}
        onDelete={remove}
      />
      <FieldError role="alert" className="lg:col-span-full">
        {error}
      </FieldError>
    </CardListRow>
  )
}
