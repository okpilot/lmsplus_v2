'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { discardQuiz } from '../actions/discard'
import type { ActiveExamSession } from '../actions/get-active-exam-session'
import { sessionHandoffKey } from '../session/_utils/quiz-session-handoff'

/**
 * Owns the resume/discard workflow for the ResumeExamBanner: the synchronous one-shot
 * re-entry guard on discard, the discardQuiz mutation, the resume handoff write, and
 * the loading/error/discarded state. The banner renders; this hook holds the logic.
 */
export function useResumeExamActions(
  opts: Readonly<{ userId: string; exam?: ActiveExamSession; activeSessionId: string }>,
) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [discarded, setDiscarded] = useState(false)
  // Synchronous one-shot re-entry guard (code-style §6): `loading` is async React state,
  // so two same-tick triggers could both pass a loading check before it commits.
  const discardingRef = useRef(false)

  function handleResume() {
    const { exam, userId } = opts
    if (!exam) return
    try {
      sessionStorage.setItem(
        sessionHandoffKey(userId),
        JSON.stringify({
          userId,
          sessionId: exam.sessionId,
          mode: 'exam',
          questionIds: exam.questionIds,
          timeLimitSeconds: exam.timeLimitSeconds,
          passMark: exam.passMark,
          subjectName: exam.subjectName,
          subjectCode: exam.subjectCode,
          startedAt: exam.startedAt,
        }),
      )
    } catch (err) {
      console.warn('[resume-exam-banner] Handoff write failed:', err)
      setError('Unable to resume right now. Please try again.')
      return
    }
    router.push('/app/quiz/session')
  }

  async function handleDiscard() {
    if (discardingRef.current) return
    discardingRef.current = true // set before the first await (code-style §6)
    setLoading(true)
    setError(null)
    try {
      const result = await discardQuiz({ sessionId: opts.activeSessionId })
      if (result.success) {
        // Terminal success: `discarded` unmounts the banner, so the ref intentionally
        // stays set — a late duplicate trigger can never re-fire (code-style §6).
        setDiscarded(true)
        router.refresh()
        return
      }
      setError(result.error ?? 'Failed to discard. Please try again.')
      discardingRef.current = false // retryable failure — release the lock
    } catch {
      setError('Server unavailable. Please try again later.')
      discardingRef.current = false // retryable failure — release the lock
    } finally {
      setLoading(false)
    }
  }

  return { loading, error, discarded, handleResume, handleDiscard }
}
