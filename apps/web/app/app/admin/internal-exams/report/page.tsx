import { redirect } from 'next/navigation'
import { QuestionBreakdown } from '@/app/app/quiz/report/_components/question-breakdown'
import { ResultSummary } from '@/app/app/quiz/report/_components/result-summary'
import {
  getAdminQuizReportQuestions,
  getAdminQuizReportSummary,
} from '@/lib/queries/admin-quiz-report'
import { PAGE_SIZE } from '@/lib/queries/quiz-report'
import { parsePageParam } from '@/lib/utils/parse-page-param'
import { AdminInternalExamReportFooter } from './_components/admin-internal-exam-report-footer'
import { AdminInternalExamReportHeader } from './_components/admin-internal-exam-report-header'

export default async function AdminInternalExamReportPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string; page?: string }>
}) {
  const { session: sessionId, page: pageParam } = await searchParams
  if (!sessionId) redirect('/app/admin/internal-exams?tab=attempts')

  const summary = await getAdminQuizReportSummary(sessionId)
  if (!summary) redirect('/app/admin/internal-exams?tab=attempts')
  // Defense-in-depth: this URL is only for internal_exam sessions.
  if (summary.mode !== 'internal_exam') {
    redirect(`/app/admin/dashboard/sessions/${sessionId}`)
  }

  const page = parsePageParam(pageParam)
  const questionsResult = await getAdminQuizReportQuestions({ sessionId, page })
  if (!questionsResult.ok) redirect('/app/admin/internal-exams?tab=attempts')

  const totalPages = Math.max(1, Math.ceil(questionsResult.totalCount / PAGE_SIZE))
  if (page > totalPages) {
    redirect(`/app/admin/internal-exams/report?session=${sessionId}&page=${totalPages}`)
  }

  return (
    <main className="space-y-6">
      <AdminInternalExamReportHeader studentName={summary.studentName} />
      <ResultSummary summary={summary} />
      <QuestionBreakdown
        questions={questionsResult.questions}
        page={page}
        totalCount={questionsResult.totalCount}
        pageSize={PAGE_SIZE}
      />
      <AdminInternalExamReportFooter />
    </main>
  )
}
