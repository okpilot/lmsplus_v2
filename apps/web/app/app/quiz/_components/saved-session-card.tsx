'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
    <Card>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{session.subjectName}</p>
            <p className="text-xs text-muted-foreground">{modeLabel(session.mode)}</p>
          </div>
          <SavedSessionButtons
            resuming={resuming}
            deleting={deleting}
            onResume={resume}
            onDelete={remove}
          />
        </div>
        <SavedSessionProgress answered={session.answeredCount} total={session.totalCount} />
        <FieldError role="alert">{error}</FieldError>
      </CardContent>
    </Card>
  )
}
