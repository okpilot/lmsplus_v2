import { redirect } from 'next/navigation'
import { QuestionBreakdown } from '@/app/app/quiz/report/_components/question-breakdown'
import { ResultSummary } from '@/app/app/quiz/report/_components/result-summary'
import { getQuizReportSummary, PAGE_SIZE } from '@/lib/queries/quiz-report'
import { getQuizReportQuestions } from '@/lib/queries/quiz-report-questions'
import { parsePageParam } from '@/lib/utils/parse-page-param'
import { ReportFooter } from './_components/report-footer'

export default async function InternalExamReportPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string; page?: string }>
}) {
  const { session: sessionId, page: pageParam } = await searchParams
  if (!sessionId) redirect('/app/internal-exam?tab=reports')

  const summary = await getQuizReportSummary(sessionId)
  if (!summary) redirect('/app/internal-exam?tab=reports')
  // Defense-in-depth: this URL is only for internal_exam sessions.
  if (summary.mode !== 'internal_exam') redirect(`/app/quiz/report?session=${sessionId}`)

  const page = parsePageParam(pageParam)
  const questionsResult = await getQuizReportQuestions({ sessionId, page })
  if (!questionsResult.ok) redirect('/app/internal-exam?tab=reports')

  const totalPages = Math.max(1, Math.ceil(questionsResult.totalCount / PAGE_SIZE))
  if (page > totalPages) {
    redirect(`/app/internal-exam/report?session=${sessionId}&page=${totalPages}`)
  }

  return (
    <main className="space-y-6">
      <ResultSummary summary={summary} />
      <QuestionBreakdown
        questions={questionsResult.questions}
        page={page}
        totalCount={questionsResult.totalCount}
        pageSize={PAGE_SIZE}
      />
      <ReportFooter />
    </main>
  )
}
