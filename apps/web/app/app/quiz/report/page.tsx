import { redirect } from 'next/navigation'
import { getQuizReportSummary, PAGE_SIZE } from '@/lib/queries/quiz-report'
import { getQuizReportQuestions } from '@/lib/queries/quiz-report-questions'
import { parsePageParam } from '@/lib/utils/parse-page-param'
import { ReportCard } from './_components/report-card'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function QuizReportPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string; page?: string }>
}) {
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

  return (
    <main className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Quiz Results</h1>
      <ReportCard
        summary={summary}
        questions={questionsResult.questions}
        page={page}
        totalCount={questionsResult.totalCount}
        pageSize={PAGE_SIZE}
      />
    </main>
  )
}
