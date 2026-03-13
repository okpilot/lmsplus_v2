'use client'

import type { QuestionStats } from '@/lib/queries/question-stats'
import { useQuestionStats } from '../_hooks/use-question-stats'

type StatisticsTabProps = {
  questionId: string
  hasAnswered: boolean
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
      <p className="pt-2 text-xs text-muted-foreground">
        Statistics reflect your previous quiz sessions.
      </p>
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
