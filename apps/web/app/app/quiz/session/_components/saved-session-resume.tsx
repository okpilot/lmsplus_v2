'use client'

import { Button } from '@/components/ui/button'
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
      <h1 className="text-lg font-semibold">Saved quiz</h1>
      <p className="text-sm text-muted-foreground">
        {MODE_LABELS[mode]}
        {subjectName ? ` - ${subjectName}` : ''}: {answeredCount} of {totalCount} answered
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
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
