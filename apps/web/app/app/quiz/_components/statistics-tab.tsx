'use client'

import type { QuestionStats } from '@/lib/queries/question-stats'
import { useRef, useState, useTransition } from 'react'
import { fetchQuestionStats } from '../actions/fetch-stats'

type StatisticsTabProps = {
  questionId: string
  hasAnswered: boolean
}

export function StatisticsTab({ questionId, hasAnswered }: StatisticsTabProps) {
  const [stats, setStats] = useState<QuestionStats | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const prevQuestionId = useRef(questionId)

  // Reset cached stats when navigating to a different question
  if (prevQuestionId.current !== questionId) {
    prevQuestionId.current = questionId
    setStats(null)
    setError(null)
  }

  if (!hasAnswered) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        Answer the question to see your statistics.
      </div>
    )
  }

  function loadStats() {
    setError(null)
    startTransition(async () => {
      try {
        const data = await fetchQuestionStats(questionId)
        setStats(data)
      } catch {
        setError('Failed to load statistics.')
      }
    })
  }

  if (!stats && !isPending && !error) {
    return (
      <div className="py-6 text-center">
        <button
          type="button"
          onClick={loadStats}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
        >
          Load Statistics
        </button>
      </div>
    )
  }

  if (isPending) {
    return (
      <div className="space-y-3 py-4">
        <div className="h-4 w-32 animate-pulse rounded bg-muted" />
        <div className="h-4 w-48 animate-pulse rounded bg-muted" />
        <div className="h-4 w-40 animate-pulse rounded bg-muted" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-2 py-8 text-center">
        <p className="text-sm text-destructive">{error}</p>
        <button type="button" onClick={loadStats} className="text-sm text-primary hover:underline">
          Retry
        </button>
      </div>
    )
  }

  if (!stats) return null

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
      {stats.fsrsState && (
        <>
          <div className="border-t border-border pt-2 text-xs font-medium text-muted-foreground">
            FSRS Data
          </div>
          <StatRow label="State" value={stats.fsrsState} />
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
      )}
    </div>
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
