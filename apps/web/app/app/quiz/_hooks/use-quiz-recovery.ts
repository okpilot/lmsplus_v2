'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { clearDeploymentPin } from '../actions/clear-deployment-pin'
import { discardQuiz } from '../actions/discard'
import { saveDraft } from '../actions/draft'
import {
  type ActiveSession,
  buildHandoffPayload,
  clearActiveSession,
  readActiveSession,
  sessionHandoffKey,
} from '../session/_utils/quiz-session-storage'

export function useQuizRecovery(userId: string) {
  const router = useRouter()
  const [session, setSession] = useState<ActiveSession | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const active = readActiveSession(userId)
    // Exam-mode sessions surface via the server-sourced ResumeExamBanner — skip here to avoid double banners.
    setSession(active?.mode === 'exam' ? null : active)
  }, [userId])

  function handleResume() {
    if (!session) return
    try {
      sessionStorage.setItem(
        sessionHandoffKey(userId),
        JSON.stringify(buildHandoffPayload(userId, session)),
      )
    } catch (err) {
      console.warn('[quiz-recovery-banner] Resume handoff failed:', err)
      setError('Unable to resume right now. Please try again.')
      return
    }
    clearActiveSession(userId)
    router.push('/app/quiz/session')
  }

  async function handleSave() {
    if (loading || !session) return
    setLoading(true)
    setError(null)
    try {
      const { sessionId, questionIds, answers, feedback, currentIndex } = session
      const result = await saveDraft({
        draftId: session.draftId,
        sessionId,
        questionIds,
        answers,
        feedback,
        currentIndex,
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
    if (loading) return
    clearActiveSession(userId)
    clearDeploymentPin().catch(() => {})
    if (session)
      discardQuiz({ sessionId: session.sessionId, draftId: session.draftId }).catch(() => {})
    setSession(null)
  }

  return { session, loading, error, handleResume, handleSave, handleDiscard }
}
