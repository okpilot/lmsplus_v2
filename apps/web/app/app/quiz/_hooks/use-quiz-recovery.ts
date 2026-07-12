'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import type { ActiveSession } from '../session/_utils/quiz-session-storage'
import { readActiveSession } from '../session/_utils/quiz-session-storage'
import { buildDiscardHandler, buildResumeHandler, buildSaveHandler } from './quiz-recovery-handlers'

export function useQuizRecovery(userId: string) {
  const router = useRouter()
  const [session, setSession] = useState<ActiveSession | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Synchronous one-shot re-entry guard SHARED by save + discard (code-style §6),
  // mirroring the shared `loading` semantics: while either action is in flight the
  // other is a no-op. `loading` stays as async React state for the UI only.
  const actionInFlightRef = useRef(false)

  useEffect(() => {
    const active = readActiveSession(userId)
    // Exam-mode sessions surface via the server-sourced ResumeExamBanner — skip here to avoid double banners.
    setSession(active?.mode === 'exam' ? null : active)
  }, [userId])

  const handleResume = buildResumeHandler(userId, session, setError, router)
  const handleSave = buildSaveHandler(
    userId,
    session,
    actionInFlightRef,
    setLoading,
    setError,
    setSession,
    router,
  )
  const handleDiscard = buildDiscardHandler(userId, session, actionInFlightRef, setSession)

  return { session, loading, error, handleResume, handleSave, handleDiscard }
}
