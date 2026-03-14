import type { QuizReportData } from '@/lib/queries/quiz-report'
import Link from 'next/link'
import { ReportQuestionRow } from './report-question-row'

function scoreColor(percentage: number): string {
  if (percentage >= 75) return 'text-green-600'
  if (percentage >= 50) return 'text-yellow-600'
  return 'text-destructive'
}

function formatDuration(startedAt: string, endedAt: string | null): string | null {
  if (!endedAt) return null
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime()
  const totalSeconds = Math.round(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes === 0) return `${seconds}s`
  return `${minutes}m ${seconds}s`
}

export function ReportCard({ report }: { report: QuizReportData }) {
  const duration = formatDuration(report.startedAt, report.endedAt)
  const rounded = Math.round(report.scorePercentage)

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">Your Score</p>
        <p className={`mt-2 text-5xl font-bold tabular-nums ${scoreColor(rounded)}`}>{rounded}%</p>
        <p className="mt-2 text-sm text-muted-foreground">
          {report.correctCount} / {report.answeredCount} correct
          {report.answeredCount < report.totalQuestions && (
            <span className="ml-1">({report.totalQuestions - report.answeredCount} skipped)</span>
          )}
        </p>
        {duration && <p className="mt-1 text-xs text-muted-foreground">Time taken: {duration}</p>}
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-medium">Question Breakdown</h2>
        <div className="space-y-2">
          {report.questions.map((question, index) => (
            <ReportQuestionRow key={question.questionId} question={question} index={index} />
          ))}
        </div>
      </div>

      <div className="flex justify-center gap-3">
        <Link
          href="/app/dashboard"
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
        >
          Back to Dashboard
        </Link>
        <Link
          href="/app/quiz"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Start Another Quiz
        </Link>
      </div>
    </div>
  )
}
