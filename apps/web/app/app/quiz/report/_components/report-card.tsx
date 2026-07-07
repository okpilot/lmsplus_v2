import Link from 'next/link'
import type { QuizReportQuestion, QuizReportSummary } from '@/lib/queries/quiz-report'
import { getReportContext } from '../_utils/report-context'
import { QuestionBreakdown } from './question-breakdown'
import { ResultSummary } from './result-summary'

type Props = {
  summary: QuizReportSummary
  questions: QuizReportQuestion[]
  page: number
  totalCount: number
  pageSize: number
}

export function ReportCard({ summary, questions, page, totalCount, pageSize }: Readonly<Props>) {
  const ctx = getReportContext(summary.mode, summary.subjectCode)

  return (
    <div className="space-y-6">
      <ResultSummary summary={summary} />

      <QuestionBreakdown
        questions={questions}
        page={page}
        totalCount={totalCount}
        pageSize={pageSize}
      />

      <div className="flex justify-center gap-3">
        <Link
          href="/app/reports"
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
        >
          {ctx.noun} Reports
        </Link>
        <Link
          href={ctx.backHref}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {ctx.backLabel}
        </Link>
      </div>
    </div>
  )
}
