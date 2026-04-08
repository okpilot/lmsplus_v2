import Link from 'next/link'
import { QuestionBreakdown } from '@/app/app/quiz/report/_components/question-breakdown'
// Cross-route import: these are purely presentational components with no student-specific logic
import { ResultSummary } from '@/app/app/quiz/report/_components/result-summary'
import type { AdminQuizReportSummary } from '@/lib/queries/admin-quiz-report'
import type { QuizReportQuestion } from '@/lib/queries/quiz-report'

type Props = Readonly<{
  summary: AdminQuizReportSummary
  questions: QuizReportQuestion[]
  page: number
  totalCount: number
  pageSize: number
}>

export function AdminReportCard({ summary, questions, page, totalCount, pageSize }: Props) {
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
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
        >
          Back to Student
        </Link>
        <Link
          href="/app/admin/dashboard"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Dashboard
        </Link>
      </div>
    </div>
  )
}
