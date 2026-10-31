import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button-variants'
import { Meter } from '@/components/ui/meter'
import { Stat, StatGroup } from '@/components/ui/stat'

type SessionSummaryProps = {
  totalQuestions: number
  answeredCount: number
  correctCount: number
  scorePercentage: number
}

export function SessionSummary({
  totalQuestions,
  answeredCount,
  correctCount,
  scorePercentage,
}: Readonly<SessionSummaryProps>) {
  const label = 'Quiz'
  const skippedCount = totalQuestions - answeredCount
  const incorrectCount = answeredCount - correctCount

  return (
    <div className="mx-auto max-w-reading space-y-6 text-center">
      <Stat variant="plain" label={`${label} Complete`} value={`${Math.round(scorePercentage)}%`} />

      <StatGroup
        columns={skippedCount > 0 ? 2 : 3}
        className={skippedCount > 0 ? 'sm:grid-cols-4' : undefined}
      >
        <Stat variant="plain" size="compact" label="Correct" value={correctCount} tone="success" />
        <Stat
          variant="plain"
          size="compact"
          label="Incorrect"
          value={incorrectCount}
          tone="danger"
        />
        {skippedCount > 0 && (
          <Stat variant="plain" size="compact" label="Skipped" value={skippedCount} />
        )}
        <Stat variant="plain" size="compact" label="Answered" value={answeredCount} />
      </StatGroup>

      <Meter value={scorePercentage} label="Score" />

      <div className="flex justify-center gap-3">
        <Link href="/app/dashboard" className={buttonVariants({ variant: 'outline' })}>
          Back to Dashboard
        </Link>
        <Link href="/app/quiz" className={buttonVariants()}>
          Start Another
        </Link>
      </div>
    </div>
  )
}
