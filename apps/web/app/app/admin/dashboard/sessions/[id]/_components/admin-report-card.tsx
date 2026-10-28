import Link from 'next/link'
import { QuestionBreakdown } from '@/app/app/quiz/report/_components/question-breakdown'
// Cross-route import: these are purely presentational components with no student-specific logic
import { ResultSummary } from '@/app/app/quiz/report/_components/result-summary'
import { buttonVariants } from '@/components/ui/button-variants'
import type { QuizReportQuestion } from '@/lib/queries/quiz-report'
import type { AdminQuizReportSummary } from '@/lib/queries/quiz-report-types'

type Props = Readonly<{
  summary: AdminQuizReportSummary
  questions: QuizReportQuestion[]
  page: number
  totalCount: number
  pageSize: number
}>

export function AdminReportCard({
  summary,
  questions,
  page,
  totalCount,
  pageSize,
}: Readonly<Props>) {
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
          href={`/app/admin/dashboard/students/${summary.studentId}`}
          className={buttonVariants({ variant: 'outline' })}
        >
          Back to Student
        </Link>
        <Link href="/app/admin/dashboard" className={buttonVariants()}>
          Dashboard
        </Link>
      </div>
    </div>
  )
}
