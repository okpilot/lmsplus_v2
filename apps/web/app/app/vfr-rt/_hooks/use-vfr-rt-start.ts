'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { startQuizSession } from '@/app/app/quiz/actions/start'
import {
  clearActiveSession,
  readActiveSession,
} from '@/app/app/quiz/session/_utils/quiz-session-storage'
import type { UseVfrRtStartOpts } from './use-vfr-rt-start-utils'
import { confirmRtOverwrite, writeRtHandoff } from './use-vfr-rt-start-utils'

export type { UseVfrRtStartOpts } from './use-vfr-rt-start-utils'

export function useVfrRtStart({
  userId,
  subjectId,
  topicIds,
  count,
  maxQuestions,
}: UseVfrRtStartOpts) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleStart() {
    if (loading) return
    if (topicIds.length === 0) {
      setError('Select at least one part to practice.')
      return
    }
    // RT shares the single active-session slot (consistent with internal-exam);
    // starting RT while another session is active uses the existing recovery/confirm flow.
    const existing = readActiveSession(userId)
    if (existing && !confirmRtOverwrite(existing.subjectName)) return

    setLoading(true)
    setError(null)
    try {
      const result = await startQuizSession({
        subjectId,
        topicIds,
        count: Math.min(count, maxQuestions || 1),
        filters: ['all'],
        calcMode: 'all',
        imageMode: 'all',
      })
      if (result.success) {
        if (!writeRtHandoff(userId, result.sessionId, result.questionIds)) {
          console.warn('[use-vfr-rt-start] sessionStorage handoff failed')
          setError('Unable to start session right now. Please try again.')
          setLoading(false)
          return
        }
        if (existing) clearActiveSession(userId)
        router.push('/app/quiz/session')
        return
      }
      setError(result.error)
      setLoading(false)
    } catch {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  return { loading, error, handleStart }
}
