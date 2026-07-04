'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { deleteDraft } from '../actions/draft-delete'
import { resumeQuizSession } from '../actions/resume'
import { writeResumeHandoff } from '../session/_utils/quiz-session-handoff'
import type { DraftData } from '../types'

export function progressColor(pct: number): string {
  if (pct >= 90) return 'text-green-600'
  if (pct < 50) return 'text-amber-500'
  return 'text-primary'
}

export function DraftCard({ draft, userId }: Readonly<{ draft: DraftData; userId: string }>) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)
  const [resuming, setResuming] = useState(false)
  const resumingRef = useRef(false)
  const [error, setError] = useState<string | null>(null)

  const answeredCount = Object.keys(draft.answers).length
  const totalCount = draft.questionIds.length
  const progress = totalCount > 0 ? (answeredCount / totalCount) * 100 : 0
  const subjectLabel = draft.subjectName ?? 'Unknown subject'
  const dateLabel = draft.createdAt
    ? `${new Date(draft.createdAt).toLocaleString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'UTC',
      })} UTC`
    : ''

  // Reset a retryable resume failure: clear the in-flight state and release the
  // one-shot ref so the user can try again. Never called on the success path.
  function failResume(message: string) {
    setError(message)
    setResuming(false)
    resumingRef.current = false
  }

  async function handleResume() {
    // Synchronous one-shot guard (code-style.md §6): resume mints a server session,
    // so a double-click would fire two starts and the second hits another_session_active.
    if (resumingRef.current) return
    resumingRef.current = true
    setResuming(true)
    setError(null)

    // A framework-level throw (network failure, aborted fetch, RSC transport) rejects
    // BEFORE the action's own try/catch runs, so guard here or the one-shot ref stays
    // stuck true and the button is permanently disabled.
    let result: Awaited<ReturnType<typeof resumeQuizSession>>
    try {
      result = await resumeQuizSession({ draftId: draft.id })
    } catch (err) {
      console.warn('[draft-card] resumeQuizSession threw:', err)
      failResume('Unable to resume right now. Please try again.')
      return
    }
    if (!result.success) {
      failResume(result.error)
      return
    }
    if (!writeResumeHandoff(userId, result.sessionId, draft)) {
      failResume('Unable to resume right now. Please try again.')
      return
    }
    // Terminal navigation is the last statement; ref intentionally NOT reset (success).
    router.push('/app/quiz/session')
  }

  async function handleDelete() {
    if (!window.confirm('Delete this saved quiz? This cannot be undone.')) return
    setDeleting(true)
    setError(null)
    const result = await deleteDraft({ draftId: draft.id })
    if (result.success) {
      setDeleting(false)
      router.refresh()
    } else {
      setError('Failed to delete. Please try again.')
      setDeleting(false)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{subjectLabel}</p>
          {dateLabel && <p className="text-xs text-muted-foreground">Saved {dateLabel}</p>}
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            data-testid="resume-draft"
            onClick={handleResume}
            disabled={resuming}
            aria-busy={resuming || undefined}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {resuming ? 'Resuming...' : 'Resume'}
          </button>
          <button
            type="button"
            data-testid="delete-draft"
            onClick={handleDelete}
            disabled={deleting}
            className="rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
      <div className="space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">
            {answeredCount} of {totalCount} answered
          </span>
          <span className={`font-medium ${progressColor(progress)}`}>{Math.round(progress)}%</span>
        </div>
        <div className="h-1 rounded-full bg-muted">
          <div
            data-testid="draft-progress"
            className="h-1 rounded-full bg-primary transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
