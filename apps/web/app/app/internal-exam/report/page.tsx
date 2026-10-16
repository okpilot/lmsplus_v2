import { QuestionBreakdown } from '@/app/app/quiz/report/_components/question-breakdown'
import { ResultSummary } from '@/app/app/quiz/report/_components/result-summary'
import { PAGE_SIZE } from '@/lib/queries/quiz-report'
import { ReportFooter } from './_components/report-footer'
import { loadInternalExamReport } from './_loaders/load-internal-exam-report'

export default async function InternalExamReportPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ session?: string; page?: string }>
}>) {
  const { session: sessionId, page: pageParam } = await searchParams
  const { summary, questions, totalCount, page } = await loadInternalExamReport({
    sessionId,
    pageParam,
  })

  return (
    <main className="space-y-6">
      <ResultSummary summary={summary} />
      <QuestionBreakdown
        questions={questions}
        page={page}
        totalCount={totalCount}
        pageSize={PAGE_SIZE}
      />
      <ReportFooter />
    </main>
  )
}
