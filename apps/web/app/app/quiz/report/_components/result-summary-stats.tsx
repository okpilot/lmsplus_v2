import type { QuizReportSummary } from '@/lib/queries/quiz-report-types'
import { formatMsDuration } from './format-duration'
import { ScoreRing } from './score-ring'

function formatDuration(startedAt: string, endedAt: string | null): string {
  if (!endedAt) return '—'
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime()
  if (ms < 0) return '—'
  return formatMsDuration(ms)
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/**
 * One label/value cell of the summary grid. Extracted because the identical
 * `<div><p label><p value></div>` shape appears in both the desktop and mobile
 * grids (code-style.md §2 extract-at-3), and inlining it nine times pushed the
 * render body past §3's 35-line composition bound.
 */
function Stat({
  label,
  value,
  accent = false,
}: Readonly<{ label: string; value: string | number; accent?: boolean }>) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={accent ? 'font-medium text-sm text-green-600' : 'font-medium text-sm'}>
        {value}
      </p>
    </div>
  )
}

/**
 * The stat grid, laid out twice: a 2-column desktop row beside a large score ring, and a
 * 2x2 mobile block under a smaller one. Both read the SAME derived `correctFraction` and
 * `skipped` values, so the two layouts cannot drift apart.
 */
type StatsProps = Readonly<{
  summary: QuizReportSummary
  correctFraction: string
  skipped: string | number
  dateStr: string
}>

export function DesktopStats({ summary, correctFraction, skipped, dateStr }: StatsProps) {
  return (
    <div className="hidden md:flex flex-row gap-6 items-center">
      <div className="shrink-0">
        <ScoreRing percentage={summary.scorePercentage} size={120} />
      </div>
      <div className="grid grid-cols-2 gap-x-8 gap-y-3 flex-1">
        <Stat label="Subject" value={summary.subjectName ?? 'Mixed'} />
        <Stat label="Date" value={formatDate(dateStr)} />
        <Stat label="Correct" value={correctFraction} accent />
        <Stat label="Time" value={formatDuration(summary.startedAt, summary.endedAt)} />
        <Stat label="Skipped" value={skipped} />
      </div>
    </div>
  )
}

export function MobileStats({ summary, correctFraction, skipped }: StatsProps) {
  return (
    <div className="flex flex-col items-center gap-4 md:hidden">
      <ScoreRing percentage={summary.scorePercentage} size={90} />
      <div className="grid grid-cols-2 gap-4 w-full text-center">
        <Stat label="Subject" value={summary.subjectName ?? 'Mixed'} />
        <Stat label="Correct" value={correctFraction} accent />
        <Stat label="Time" value={formatDuration(summary.startedAt, summary.endedAt)} />
        <Stat label="Skipped" value={skipped} />
      </div>
    </div>
  )
}
