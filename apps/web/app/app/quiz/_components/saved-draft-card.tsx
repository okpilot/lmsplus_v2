'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { deleteDraft } from '../actions/draft-delete'
import type { DraftData } from '../types'

type SavedDraftCardProps = { drafts: DraftData[] }

export function SavedDraftCard({ drafts }: SavedDraftCardProps) {
  if (drafts.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center">
        <p className="text-sm text-muted-foreground">
          No saved quizzes. Start a new quiz and use "Save for Later" to save your progress.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {drafts.map((draft) => (
        <DraftCard key={draft.id} draft={draft} />
      ))}
    </div>
  )
}

function progressColor(pct: number): string {
  if (pct >= 90) return 'text-green-600'
  if (pct < 50) return 'text-amber-500'
  return 'text-primary'
}

function DraftCard({ draft }: { draft: DraftData }) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)
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

  function handleResume() {
    sessionStorage.setItem(
      'quiz-session',
      JSON.stringify({
        sessionId: draft.sessionId,
        questionIds: draft.questionIds,
        draftAnswers: draft.answers,
        draftCurrentIndex: draft.currentIndex,
        draftId: draft.id,
        subjectName: draft.subjectName,
        subjectCode: draft.subjectCode,
      }),
    )
    router.push('/app/quiz/session')
  }

  async function handleDelete() {
    if (!window.confirm('Delete this saved quiz? This cannot be undone.')) return
    setDeleting(true)
    setError(null)
    const result = await deleteDraft({ draftId: draft.id })
    if (result.success) {
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
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Resume
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
