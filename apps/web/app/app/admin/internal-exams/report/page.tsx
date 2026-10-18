import { QuestionBreakdown } from '@/app/app/quiz/report/_components/question-breakdown'
import { ResultSummary } from '@/app/app/quiz/report/_components/result-summary'
import { requireAdmin } from '@/lib/auth/require-admin'
import { PAGE_SIZE } from '@/lib/queries/quiz-report'
import { AdminInternalExamReportFooter } from './_components/admin-internal-exam-report-footer'
import { AdminInternalExamReportHeader } from './_components/admin-internal-exam-report-header'
import { loadAdminInternalExamReport } from './_loaders/load-admin-internal-exam-report'

export default async function AdminInternalExamReportPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ session?: string; page?: string }>
}>) {
  await requireAdmin()
  const { session: sessionId, page: pageParam } = await searchParams
  const { summary, questions, totalCount, page } = await loadAdminInternalExamReport({
    sessionId,
    pageParam,
  })

  return (
    <main className="space-y-6">
      <AdminInternalExamReportHeader studentName={summary.studentName} />
      <ResultSummary summary={summary} />
      <QuestionBreakdown
        questions={questions}
        page={page}
        totalCount={totalCount}
        pageSize={PAGE_SIZE}
      />
      <AdminInternalExamReportFooter />
    </main>
  )
}
