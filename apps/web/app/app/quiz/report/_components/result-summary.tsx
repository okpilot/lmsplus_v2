import type { QuizReportSummary } from '@/lib/queries/quiz-report'
import { ScoreRing } from './score-ring'

function formatDuration(startedAt: string, endedAt: string | null): string {
  if (!endedAt) return '—'
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime()
  if (ms < 0) return '—'
  const totalSeconds = Math.round(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes === 0) return `${seconds}s`
  return `${minutes}m ${seconds}s`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function PassFailBadge({ passed }: { passed: boolean }) {
  return passed ? (
    <span className="rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1 text-sm font-semibold text-green-600 dark:text-green-400">
      PASSED
    </span>
  ) : (
    <span className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-sm font-semibold text-red-600 dark:text-red-400">
      FAILED
    </span>
  )
}

type Props = Readonly<{ summary: QuizReportSummary }>

export function ResultSummary({ summary }: Props) {
  const dateStr = summary.endedAt ?? summary.startedAt
  const skipped = summary.totalQuestions - summary.answeredCount
  const isExam = summary.mode === 'mock_exam'

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="mb-4 flex items-center justify-center gap-2">
        {isExam && (
          <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-xs font-semibold text-red-600 dark:text-red-400">
            EXAM
          </span>
        )}
        <p className="text-center font-semibold text-lg">
          {isExam ? 'Exam Complete' : 'Quiz Complete'}
        </p>
      </div>

      {isExam && summary.passed !== null && (
        <div className="mb-4 flex justify-center">
          <PassFailBadge passed={summary.passed} />
        </div>
      )}

      {/* Desktop layout */}
      <div className="hidden md:flex flex-row gap-6 items-center">
        <div className="shrink-0">
          <ScoreRing percentage={summary.scorePercentage} size={120} />
        </div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-3 flex-1">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Subject</p>
            <p className="font-medium text-sm">{summary.subjectName ?? 'Mixed'}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Date</p>
            <p className="font-medium text-sm">{formatDate(dateStr)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Correct</p>
            <p className="font-medium text-sm text-green-600">
              {summary.correctCount} / {isExam ? summary.totalQuestions : summary.answeredCount}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Time</p>
            <p className="font-medium text-sm">
              {formatDuration(summary.startedAt, summary.endedAt)}
            </p>
          </div>
          {!isExam && (
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Skipped</p>
              <p className="font-medium text-sm">{skipped}</p>
            </div>
          )}
        </div>
      </div>

      {/* Mobile layout */}
      <div className="flex flex-col items-center gap-4 md:hidden">
        <ScoreRing percentage={summary.scorePercentage} size={90} />
        <div className="grid grid-cols-3 gap-4 w-full text-center">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Subject</p>
            <p className="font-medium text-sm">{summary.subjectName ?? 'Mixed'}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Correct</p>
            <p className="font-medium text-sm text-green-600">
              {summary.correctCount} / {isExam ? summary.totalQuestions : summary.answeredCount}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Time</p>
            <p className="font-medium text-sm">
              {formatDuration(summary.startedAt, summary.endedAt)}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
