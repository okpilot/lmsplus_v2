import Link from 'next/link'
import type { SessionReport } from '@/lib/queries/reports'
import { scoreColor } from '@/lib/utils/score-color'
import { formatDate, MODE_LABELS } from './reports-utils'

export function SessionCard({ session: s }: Readonly<{ session: SessionReport }>) {
  const exam = s.mode === 'mock_exam'
  const score = s.scorePercentage == null ? '\u2014' : `${Math.round(s.scorePercentage)}%`
  const color = s.scorePercentage == null ? undefined : scoreColor(s.scorePercentage)

  return (
    <Link
      href={`/app/quiz/report?session=${s.id}`}
      className="block rounded-lg border border-border px-4 py-3 transition-colors hover:bg-accent"
    >
      <div className="flex items-start justify-between">
        <p className="font-medium">{s.subjectName ?? '\u2014'}</p>
        <span className="ml-3 text-xl font-semibold tabular-nums" style={{ color }}>
          {score}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">{formatDate(s.startedAt)}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Mode:{' '}
        {exam ? (
          <span className="font-semibold uppercase text-amber-600">{MODE_LABELS.mock_exam}</span>
        ) : (
          <span className="font-medium">{MODE_LABELS[s.mode] ?? s.mode}</span>
        )}
        <span className="ml-3">
          Correct: {s.correctCount} / {s.totalQuestions}
        </span>
        <span className="ml-3">Time: {s.durationMinutes}m</span>
      </p>
    </Link>
  )
}
