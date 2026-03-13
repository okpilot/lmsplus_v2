'use client'

import type { QuestionStats } from '@/lib/queries/question-stats'
import { type ReactNode, useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { fetchQuestionStats } from '../actions/fetch-stats'

type StatisticsTabProps = {
  questionId: string
  hasAnswered: boolean
}

function useQuestionStats(questionId: string) {
  const [stats, setStats] = useState<QuestionStats | null>(null)
  const [, startTransition] = useTransition()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const prevQuestionId = useRef(questionId)
  const generation = useRef(0)

  // Reset state when questionId changes
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

  // Auto-fetch when component mounts or questionId changes.
  useEffect(() => {
    loadStats()
  }, [loadStats])

  return { stats, isLoading, error, loadStats }
}

export function StatisticsTab({ questionId, hasAnswered }: StatisticsTabProps) {
  const { stats, isLoading, error, loadStats } = useQuestionStats(questionId)
  if (isLoading) return <LoadingSkeleton />
  if (error) return <ErrorMessage message={error} onRetry={loadStats} />
  if (!stats) return <NotAnsweredMessage hasAnswered={hasAnswered} />
  return <StatsDisplay stats={stats} />
}

function NotAnsweredMessage({ hasAnswered }: { hasAnswered: boolean }) {
  const message = hasAnswered
    ? 'No statistics available for this question yet.'
    : 'Answer this question to see statistics.'
  return <div className="py-8 text-center text-sm text-muted-foreground">{message}</div>
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3 py-4">
      <div className="h-4 w-32 animate-pulse rounded bg-muted" />
      <div className="h-4 w-48 animate-pulse rounded bg-muted" />
      <div className="h-4 w-40 animate-pulse rounded bg-muted" />
    </div>
  )
}

function ErrorMessage({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="space-y-2 py-8 text-center">
      <p className="text-sm text-destructive">{message}</p>
      <button type="button" onClick={onRetry} className="text-sm text-primary hover:underline">
        Retry
      </button>
    </div>
  )
}

const FSRS_STATE_LABELS: Record<string, string> = {
  new: 'New',
  learning: 'Learning',
  review: 'Review',
  relearning: 'Relearning',
}

function formatFsrsState(state: string): string {
  return FSRS_STATE_LABELS[state] ?? state.charAt(0).toUpperCase() + state.slice(1)
}

function StatsDisplay({ stats }: { stats: QuestionStats }) {
  const accuracy =
    stats.timesSeen > 0 ? Math.round((stats.correctCount / stats.timesSeen) * 100) : 0

  return (
    <div className="space-y-3 py-4 text-sm">
      <StatRow label="Times seen" value={String(stats.timesSeen)} />
      <StatRow label="Correct" value={`${stats.correctCount} (${accuracy}%)`} />
      <StatRow label="Incorrect" value={String(stats.incorrectCount)} />
      {stats.lastAnswered && (
        <StatRow
          label="Last answered"
          value={new Date(stats.lastAnswered).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })}
        />
      )}
      <FsrsSection stats={stats} />
    </div>
  )
}

function FsrsSection({ stats }: { stats: QuestionStats }): ReactNode {
  if (!stats.fsrsState) return null
  return (
    <>
      <div className="border-t border-border pt-2 text-xs font-medium text-muted-foreground">
        FSRS Data
      </div>
      <StatRow label="State" value={formatFsrsState(stats.fsrsState)} />
      {stats.fsrsStability != null && (
        <StatRow label="Stability" value={stats.fsrsStability.toFixed(1)} />
      )}
      {stats.fsrsDifficulty != null && (
        <StatRow label="Difficulty" value={stats.fsrsDifficulty.toFixed(1)} />
      )}
      {stats.fsrsInterval != null && (
        <StatRow label="Interval" value={`${stats.fsrsInterval} days`} />
      )}
    </>
  )
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  )
}
