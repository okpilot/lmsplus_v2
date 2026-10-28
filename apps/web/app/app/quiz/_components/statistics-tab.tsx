'use client'

import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { CardList } from '@/components/ui/card'
import { EmptyNote } from '@/components/ui/empty'
import { Heading } from '@/components/ui/heading'
import { Skeleton } from '@/components/ui/skeleton'
import type { QuestionStats } from '@/lib/queries/question-stats'
import { useQuestionStats } from '../_hooks/use-question-stats'

type StatisticsTabProps = {
  questionId: string
  hasAnswered: boolean
}

export function StatisticsTab({ questionId, hasAnswered }: Readonly<StatisticsTabProps>) {
  const { stats, isLoading, error, loadStats } = useQuestionStats(questionId)
  if (isLoading) return <LoadingSkeleton />
  if (error) return <ErrorMessage message={error} onRetry={loadStats} />
  if (!stats) return <NotAnsweredMessage hasAnswered={hasAnswered} />
  return <StatsDisplay stats={stats} />
}

function NotAnsweredMessage({ hasAnswered }: Readonly<{ hasAnswered: boolean }>) {
  const message = hasAnswered
    ? 'No statistics available for this question yet.'
    : 'Answer this question to see statistics.'
  return (
    <EmptyNote variant="inline" className="py-8 text-center">
      {message}
    </EmptyNote>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3 py-4">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-4 w-40" />
    </div>
  )
}

function ErrorMessage({ message, onRetry }: Readonly<{ message: string; onRetry: () => void }>) {
  return (
    <Alert tone="danger" className="my-4">
      <AlertDescription>{message}</AlertDescription>
      <AlertAction>
        <Button type="button" variant="link" size="sm" onClick={onRetry}>
          Retry
        </Button>
      </AlertAction>
    </Alert>
  )
}

function StatsDisplay({ stats }: Readonly<{ stats: QuestionStats }>) {
  const accuracy =
    stats.timesSeen > 0 ? Math.round((stats.correctCount / stats.timesSeen) * 100) : 0

  return (
    <div className="space-y-3 py-4">
      <Heading level={3}>Your Statistics</Heading>
      <CardList>
        <StatRow label="Times seen" value={String(stats.timesSeen)} />
        <StatRow
          label="Correct"
          value={`${stats.correctCount} (${accuracy}%)`}
          className="text-success"
        />
        <StatRow label="Incorrect" value={String(stats.incorrectCount)} className="text-danger" />
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
      </CardList>
      <p className="text-xs text-muted-foreground">
        Statistics reflect your previous quiz sessions.
      </p>
    </div>
  )
}

function StatRow({
  label,
  value,
  className,
}: Readonly<{
  label: string
  value: string
  className?: string
}>) {
  return (
    <div className="flex justify-between px-4 py-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm font-semibold tabular-nums ${className ?? ''}`}>{value}</span>
    </div>
  )
}
