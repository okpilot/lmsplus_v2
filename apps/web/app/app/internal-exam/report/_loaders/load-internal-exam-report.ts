import { redirect } from 'next/navigation'
import { redirectOnPageOverflow, UUID_RE } from '@/app/app/quiz/report/_utils/report-view-logic'
import { getQuizReportSummary, PAGE_SIZE, type QuizReportQuestion } from '@/lib/queries/quiz-report'
import { getQuizReportQuestions } from '@/lib/queries/quiz-report-questions'
import type { QuizReportSummary } from '@/lib/queries/quiz-report-types'
import { parsePageParam } from '@/lib/utils/parse-page-param'

export type InternalExamReportData = {
  summary: QuizReportSummary
  questions: QuizReportQuestion[]
  totalCount: number
  page: number
}

/** Validates the URL, reads summary and questions in parallel, and redirects on any invalid state. */
export async function loadInternalExamReport(opts: {
  sessionId?: string
  pageParam?: string
}): Promise<InternalExamReportData> {
  const { sessionId, pageParam } = opts
  if (!sessionId || !UUID_RE.test(sessionId)) redirect('/app/internal-exam?tab=reports')

  const page = parsePageParam(pageParam)
  const [summary, questionsResult] = await Promise.all([
    getQuizReportSummary(sessionId),
    getQuizReportQuestions({ sessionId, page }),
  ])
  if (!summary) redirect('/app/internal-exam?tab=reports')
  // Defense-in-depth: this URL is only for internal_exam sessions.
  if (summary.mode !== 'internal_exam') redirect(`/app/quiz/report?session=${sessionId}`)

  if (!questionsResult.ok) redirect('/app/internal-exam?tab=reports')

  redirectOnPageOverflow(
    '/app/internal-exam/report',
    sessionId,
    page,
    questionsResult.totalCount,
    PAGE_SIZE,
  )

  return {
    summary,
    questions: questionsResult.questions,
    totalCount: questionsResult.totalCount,
    page,
  }
}
