'use client'

import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/field-error'
import { MODE_LABELS, type QuizMode } from '@/lib/constants/exam-modes'
import { useSavedSessionResume } from '../_hooks/use-saved-session-resume'

type Props = {
  sessionId: string
  subjectName?: string
  mode: QuizMode
  answeredCount: number
  totalCount: number
}

export function SavedSessionResume({
  sessionId,
  subjectName,
  mode,
  answeredCount,
  totalCount,
}: Readonly<Props>) {
  const { resume, discard, loading, error } = useSavedSessionResume(sessionId)

  return (
    <div className="mx-auto max-w-md space-y-4 py-10 text-center">
      <div className="space-y-1">
        <h1 className="text-title font-semibold tracking-tight">Saved quiz</h1>
        <p className="text-body text-muted-foreground">
          {`${MODE_LABELS[mode]}${subjectName ? ` - ${subjectName}` : ''}: ${answeredCount} of ${totalCount} answered`}
        </p>
      </div>
      <FieldError role="alert" className="justify-center">
        {error}
      </FieldError>
      <div className="flex justify-center gap-2">
        <Button onClick={resume} disabled={loading}>
          Resume
        </Button>
        <Button variant="outline" onClick={discard} disabled={loading}>
          Delete
        </Button>
      </div>
    </div>
  )
}
