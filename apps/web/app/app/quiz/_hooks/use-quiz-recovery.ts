'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import type { ActiveSession } from '../session/_utils/quiz-session-storage'
import { readActiveSession } from '../session/_utils/quiz-session-storage'
import { buildDiscardHandler, buildResumeHandler, buildSaveHandler } from './quiz-recovery-handlers'

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

  const handleResume = buildResumeHandler(userId, session, setError, setSession, router)
  const handleSave = buildSaveHandler(
    userId,
    session,
    loading,
    setLoading,
    setError,
    setSession,
    router,
  )
  const handleDiscard = buildDiscardHandler(userId, session, loading, setSession)

  return { session, loading, error, handleResume, handleSave, handleDiscard }
}
