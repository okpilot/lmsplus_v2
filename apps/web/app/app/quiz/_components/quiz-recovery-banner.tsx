'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { clearDeploymentPin } from '../actions/clear-deployment-pin'
import { discardQuiz } from '../actions/discard'
import { saveDraft } from '../actions/draft'
import {
  type ActiveSession,
  clearActiveSession,
  readActiveSession,
} from '../session/_utils/quiz-session-storage'

export function QuizRecoveryBanner({ userId }: { userId: string }) {
  const router = useRouter()
  const [session, setSession] = useState<ActiveSession | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setSession(readActiveSession(userId))
  }, [userId])

  if (session === null) return null

  const answeredCount = Object.keys(session.answers).length
  const totalCount = session.questionIds.length

  function handleResume() {
    if (!session) return
    sessionStorage.setItem(
      'quiz-session',
      JSON.stringify({
        sessionId: session.sessionId,
        questionIds: session.questionIds,
        draftAnswers: session.answers,
        draftCurrentIndex: session.currentIndex,
        draftId: session.draftId,
        subjectName: session.subjectName,
        subjectCode: session.subjectCode,
      }),
    )
    clearActiveSession(userId)
    router.push('/app/quiz/session')
  }

  async function handleSave() {
    if (!session) return
    setLoading(true)
    setError(null)
    try {
      const result = await saveDraft({
        draftId: session.draftId,
        sessionId: session.sessionId,
        questionIds: session.questionIds,
        answers: session.answers,
        currentIndex: session.currentIndex,
        subjectName: session.subjectName,
        subjectCode: session.subjectCode,
      })
      if (result.success) {
        clearActiveSession(userId)
        clearDeploymentPin().catch(() => {})
        router.refresh()
        setSession(null)
      } else {
        setError(result.error ?? 'Failed to save. Please try again.')
      }
    } catch {
      setError('Server unavailable. Please try again later.')
    } finally {
      setLoading(false)
    }
  }

  function handleDiscard() {
    const captured = session
    clearActiveSession(userId)
    clearDeploymentPin().catch(() => {})
    setSession(null)
    if (captured) {
      discardQuiz({ sessionId: captured.sessionId, draftId: captured.draftId }).catch(() => {})
    }
  }

  return (
    <div className="mx-auto max-w-md rounded-lg border border-primary/30 bg-primary/5 p-4 mb-4">
      <p className="text-sm font-medium text-foreground">Unfinished quiz found</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {session.subjectName ? `${session.subjectName} — ` : ''}
        {answeredCount} of {totalCount} questions answered
      </p>
      {error && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={handleResume}
          disabled={loading}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          Resume
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={loading}
          className="rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
        >
          {loading ? 'Saving...' : 'Save for Later'}
        </button>
        <button
          type="button"
          onClick={handleDiscard}
          disabled={loading}
          className="rounded-lg border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
        >
          Discard
        </button>
      </div>
    </div>
  )
}
