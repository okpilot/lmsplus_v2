import Link from 'next/link'
import { CardListRow } from '@/components/ui/card'
import { isExamMode, MODE_LABELS, modeLabel } from '@/lib/constants/exam-modes'
import { reportUrl } from '@/lib/constants/report-paths'
import type { SessionReport } from '@/lib/queries/reports'
import { formatCorrectFraction } from '@/lib/utils/format-correct-fraction'
import { scoreColor } from '@/lib/utils/score-color'
import { formatDate, formatDurationMinutes } from './reports-utils'

export function SessionCard({ session: s }: Readonly<{ session: SessionReport }>) {
  const score = s.scorePercentage == null ? '\u2014' : `${Math.round(s.scorePercentage)}%`
  const color = s.scorePercentage == null ? undefined : scoreColor(s.scorePercentage)

  return (
    <CardListRow
      render={<Link href={reportUrl(s.mode, s.id, s.subjectCode)} prefetch={false} />}
      className="block transition-colors hover:bg-accent outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between">
        <p className="font-medium">{s.subjectName ?? '\u2014'}</p>
        <span className="ml-3 text-heading tabular-nums" style={{ color }}>
          {score}
        </span>
      </div>
      <p className="mt-0.5 text-caption text-muted-foreground">{formatDate(s.startedAt)}</p>
      <p className="mt-1 text-caption text-muted-foreground">
        Mode:{' '}
        {isExamMode(s.mode) ? (
          <span className="font-semibold uppercase text-caution">{MODE_LABELS[s.mode]}</span>
        ) : (
          <span className="font-medium">{modeLabel(s.mode)}</span>
        )}
        <span className="ml-3">
          Correct: {formatCorrectFraction(s.correctCount, s.answeredItems)}
        </span>
        <span className="ml-3">Time: {formatDurationMinutes(s.durationMinutes)}</span>
      </p>
    </CardListRow>
  )
}
