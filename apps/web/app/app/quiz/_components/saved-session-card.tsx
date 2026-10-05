'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { MODE_LABELS, type QuizMode } from '@/lib/constants/exam-modes'
import type { SavedQuizSession } from '@/lib/queries/load-saved-quizzes'
import { discardSavedQuiz, resumeSavedQuiz } from '../actions/saved-quiz'
import { getQuizDeviceId } from '../session/_utils/quiz-device-id'
import { progressColor } from './draft-card'

const RESUME_ERROR = 'Unable to resume right now. Please try again.'
const DISCARD_ERROR = 'Failed to delete. Please try again.'

function modeLabel(mode: string): string {
  return MODE_LABELS[mode as QuizMode] ?? mode
}

/** A server-saved quiz: Resume reopens the same session id, Delete clears the saved marker. */
export function SavedSessionCard({ session }: Readonly<{ session: SavedQuizSession }>) {
  const router = useRouter()
  const [resuming, setResuming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Synchronous one-shot guard (code-style §6): a double-click must not resume twice.
  const resumingRef = useRef(false)

  const progress = session.totalCount > 0 ? (session.answeredCount / session.totalCount) * 100 : 0

  function failResume(message: string) {
    setError(message)
    setResuming(false)
    resumingRef.current = false
  }

  async function handleResume() {
    if (resumingRef.current) return
    resumingRef.current = true
    setResuming(true)
    setError(null)
    try {
      const result = await resumeSavedQuiz({
        sessionId: session.sessionId,
        deviceId: getQuizDeviceId(),
      })
      if (!result.success) return failResume(result.error)
    } catch {
      return failResume(RESUME_ERROR)
    }
    // Terminal navigation is the last statement; ref intentionally NOT reset (success).
    router.push(`/app/quiz/session/${session.sessionId}`)
  }

  async function handleDelete() {
    if (!window.confirm('Delete this saved quiz? This cannot be undone.')) return
    setDeleting(true)
    setError(null)
    try {
      const result = await discardSavedQuiz({ sessionId: session.sessionId })
      if (result.success) return router.refresh()
      setError(result.error)
    } catch {
      setError(DISCARD_ERROR)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{session.subjectName}</p>
          <p className="text-xs text-muted-foreground">{modeLabel(session.mode)}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            type="button"
            data-testid="resume-saved-session"
            onClick={handleResume}
            disabled={resuming}
            aria-busy={resuming || undefined}
          >
            {resuming ? 'Resuming...' : 'Resume'}
          </Button>
          <Button
            type="button"
            variant="outline"
            data-testid="delete-saved-session"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        </div>
      </div>
      <div className="space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">
            {session.answeredCount} of {session.totalCount} answered
          </span>
          <span className={`font-medium ${progressColor(progress)}`}>{Math.round(progress)}%</span>
        </div>
        <div className="h-1 rounded-full bg-muted">
          <div className="h-1 rounded-full bg-primary" style={{ width: `${progress}%` }} />
        </div>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
