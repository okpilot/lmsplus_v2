import { redirect } from 'next/navigation'
import { UUID_RE } from '@/app/app/quiz/report/_utils/report-view-logic'
import {
  getAdminQuizReportQuestions,
  getAdminQuizReportSummary,
} from '@/lib/queries/admin-quiz-report'
import { PAGE_SIZE, type QuizReportQuestion } from '@/lib/queries/quiz-report'
import type { AdminQuizReportSummary } from '@/lib/queries/quiz-report-types'
import { parsePageParam } from '@/lib/utils/parse-page-param'

export type AdminInternalExamReportData = {
  summary: AdminQuizReportSummary
  questions: QuizReportQuestion[]
  totalCount: number
  page: number
}

const ATTEMPTS_URL = '/app/admin/internal-exams?tab=attempts'

/** Validates the URL, reads summary and questions in parallel, and redirects on any invalid state. */
export async function loadAdminInternalExamReport(opts: {
  sessionId?: string
  pageParam?: string
}): Promise<AdminInternalExamReportData> {
  const { sessionId, pageParam } = opts
  if (!sessionId || !UUID_RE.test(sessionId)) redirect(ATTEMPTS_URL)

  const page = parsePageParam(pageParam)
  const [summary, result] = await Promise.all([
    getAdminQuizReportSummary(sessionId),
    getAdminQuizReportQuestions({ sessionId, page }),
  ])
  if (!summary) redirect(ATTEMPTS_URL)
  // Defense-in-depth: this URL is only for internal_exam sessions.
  if (summary.mode !== 'internal_exam') redirect(`/app/admin/dashboard/sessions/${sessionId}`)
  if (!result.ok) redirect(ATTEMPTS_URL)

  const totalPages = Math.max(1, Math.ceil(result.totalCount / PAGE_SIZE))
  if (page > totalPages) {
    redirect(`/app/admin/internal-exams/report?session=${sessionId}&page=${totalPages}`)
  }

  return { summary, questions: result.questions, totalCount: result.totalCount, page }
}
