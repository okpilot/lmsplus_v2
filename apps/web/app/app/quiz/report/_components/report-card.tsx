import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button-variants'
import type { QuizReportQuestion } from '@/lib/queries/quiz-report'
import type { QuizReportSummary } from '@/lib/queries/quiz-report-types'
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
        <Link href="/app/reports" className={buttonVariants({ variant: 'outline' })}>
          {ctx.noun} Reports
        </Link>
        <Link href={ctx.backHref} className={buttonVariants()}>
          {ctx.backLabel}
        </Link>
      </div>
    </div>
  )
}
