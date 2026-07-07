import { redirect } from 'next/navigation'
import { getFlaggedQuestionIds } from '@/lib/queries/flagged-questions'
import { getQuizReportSummary, PAGE_SIZE } from '@/lib/queries/quiz-report'
import { getQuizReportQuestions } from '@/lib/queries/quiz-report-questions'
import { parsePageParam } from '@/lib/utils/parse-page-param'
import { ReportCard } from './_components/report-card'
import { ReportFlagProvider } from './_components/report-flag-context'
import { getReportContext } from './_utils/report-context'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function QuizReportPage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ session?: string; page?: string }>
}>) {
  const { session: sessionId, page: pageParam } = await searchParams
  if (!sessionId || !UUID_RE.test(sessionId)) redirect('/app/quiz')

  const summary = await getQuizReportSummary(sessionId)
  if (!summary) redirect('/app/quiz')

  const page = parsePageParam(pageParam)
  const questionsResult = await getQuizReportQuestions({ sessionId, page })
  if (!questionsResult.ok) redirect('/app/quiz')

  // Use live answer count (not summary.totalQuestions) — partial submissions mean answered < total
  const totalPages = Math.max(1, Math.ceil(questionsResult.totalCount / PAGE_SIZE))
  if (page > totalPages) {
    redirect(`/app/quiz/report?session=${sessionId}&page=${totalPages}`)
  }

  const flaggedIds = await getFlaggedQuestionIds(questionsResult.questions.map((q) => q.questionId))
  const ctx = getReportContext(summary.mode, summary.subjectCode)

  return (
    <main className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{ctx.noun} Results</h1>
      <ReportFlagProvider key={`${sessionId}-${page}`} initialFlaggedIds={flaggedIds}>
        <ReportCard
          summary={summary}
          questions={questionsResult.questions}
          page={page}
          totalCount={questionsResult.totalCount}
          pageSize={PAGE_SIZE}
        />
      </ReportFlagProvider>
    </main>
  )
}
