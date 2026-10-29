'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { deleteDraftAndRefresh } from '../actions/discard-and-refresh'
import { resumeQuizSession } from '../actions/resume'
import type { DraftData } from '../types'
import { SavedRow } from './saved-draft-card'

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: pre-existing; split when next edited (#1606)
export function DraftCard({ draft }: Readonly<{ draft: DraftData }>) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)
  const [resuming, setResuming] = useState(false)
  const resumingRef = useRef(false)
  const [error, setError] = useState<string | null>(null)

  const answeredCount = Object.keys(draft.answers).length
  const totalCount = draft.questionIds.length
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
    // Terminal navigation is the last statement; ref intentionally NOT reset (success).
    router.push(`/app/quiz/session/${result.sessionId}`)
  }

  async function handleDelete() {
    if (!window.confirm('Delete this saved quiz? This cannot be undone.')) return
    setDeleting(true)
    setError(null)
    try {
      const result = await deleteDraftAndRefresh({ draftId: draft.id })
      if (!result.success) setError('Failed to delete. Please try again.')
    } catch {
      setError('Failed to delete. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <SavedRow
      rowTestId="draft-card"
      title={subjectLabel}
      subtitle={dateLabel ? `Saved ${dateLabel}` : undefined}
      answered={answeredCount}
      total={totalCount}
      error={error}
      resumeTestId="resume-draft"
      deleteTestId="delete-draft"
      resuming={resuming}
      resumeDisabled={resuming}
      deleting={deleting}
      deleteDisabled={deleting}
      onResume={handleResume}
      onDelete={handleDelete}
    />
  )
}
