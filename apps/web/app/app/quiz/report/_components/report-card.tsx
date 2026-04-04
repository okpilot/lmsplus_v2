import Link from 'next/link'
import type { QuizReportData } from '@/lib/queries/quiz-report'
import { QuestionBreakdown } from './question-breakdown'
import { ResultSummary } from './result-summary'

export function ReportCard({ report }: { report: QuizReportData }) {
  return (
    <div className="space-y-6">
      <ResultSummary report={report} />

      <QuestionBreakdown questions={report.questions} />

      <div className="flex justify-center gap-3">
        <Link
          href="/app/reports"
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
        >
          Quiz Reports
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
