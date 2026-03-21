import Link from 'next/link'
import type { SessionReport } from '@/lib/queries/reports'
import { scoreColor } from '@/lib/utils/score-color'
import { formatDate, MODE_LABELS } from './reports-utils'

export function SessionCard({ session: s }: { session: SessionReport }) {
  const exam = s.mode === 'mock_exam'
  const score = s.scorePercentage != null ? `${Math.round(s.scorePercentage)}%` : '\u2014'
  const color = s.scorePercentage != null ? scoreColor(s.scorePercentage) : undefined

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
          <span className="font-semibold text-amber-600">EXAM</span>
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
