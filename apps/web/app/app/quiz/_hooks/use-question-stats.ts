'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import type { QuestionStats } from '@/lib/queries/question-stats'
import { fetchQuestionStats } from '../actions/fetch-stats'

/**
 * Fetches question statistics via server action when questionId changes.
 * Uses startTransition to keep the UI responsive during the fetch.
 */
export function useQuestionStats(questionId: string) {
  const [stats, setStats] = useState<QuestionStats | null>(null)
  const [, startTransition] = useTransition()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const prevQuestionId = useRef(questionId)
  const generation = useRef(0)

  if (prevQuestionId.current !== questionId) {
    prevQuestionId.current = questionId
    generation.current += 1
    setStats(null)
    setError(null)
    if (isLoading) setIsLoading(false)
  }

  const loadStats = useCallback(() => {
    const gen = generation.current
    setError(null)
    setIsLoading(true)
    startTransition(async () => {
      try {
        const data = await fetchQuestionStats(questionId)
        if (gen === generation.current) setStats(data)
      } catch {
        if (gen === generation.current) setError('Failed to load statistics.')
      } finally {
        if (gen === generation.current) setIsLoading(false)
      }
    })
  }, [questionId])

  // Auto-fetch when questionId changes (startTransition handles the async work)
  useEffect(() => {
    loadStats()
  }, [loadStats])

  return { stats, isLoading, error, loadStats }
}
