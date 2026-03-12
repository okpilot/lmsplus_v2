'use client'

import type { QuestionStats } from '@/lib/queries/question-stats'
import { startTransition, useEffect, useState } from 'react'
import { fetchQuestionStats } from '../actions/fetch-stats'

type StatisticsTabProps = {
  questionId: string
  hasAnswered: boolean
}

export function StatisticsTab({ questionId, hasAnswered }: StatisticsTabProps) {
  const [stats, setStats] = useState<QuestionStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!hasAnswered) return
    setLoading(true)
    setError(null)
    startTransition(() => {
      fetchQuestionStats(questionId)
        .then((data) => {
          setStats(data)
          setLoading(false)
        })
        .catch(() => {
          setError('Failed to load statistics.')
          setLoading(false)
        })
    })
  }, [questionId, hasAnswered])

  if (!hasAnswered) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        Answer the question to see your statistics.
      </div>
    )
  }

  if (loading || !stats) {
    return (
      <div className="space-y-3 py-4">
        <div className="h-4 w-32 animate-pulse rounded bg-muted" />
        <div className="h-4 w-48 animate-pulse rounded bg-muted" />
        <div className="h-4 w-40 animate-pulse rounded bg-muted" />
      </div>
    )
  }

  if (error) {
    return <div className="py-8 text-center text-sm text-destructive">{error}</div>
  }

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
