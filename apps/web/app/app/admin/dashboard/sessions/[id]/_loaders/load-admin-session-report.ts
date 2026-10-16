import { notFound, redirect } from 'next/navigation'
import { UUID_RE } from '@/app/app/quiz/report/_utils/report-view-logic'
import {
  getAdminQuizReportQuestions,
  getAdminQuizReportSummary,
} from '@/lib/queries/admin-quiz-report'
import { PAGE_SIZE, type QuizReportQuestion } from '@/lib/queries/quiz-report'
import type { AdminQuizReportSummary } from '@/lib/queries/quiz-report-types'
import { parsePageParam } from '@/lib/utils/parse-page-param'

export type AdminSessionReportData = {
  summary: AdminQuizReportSummary
  questions: QuizReportQuestion[]
  totalCount: number
  page: number
}

const DASHBOARD_URL = '/app/admin/dashboard'

/** Validates the id, reads summary and questions in parallel, and redirects on any invalid state. */
export async function loadAdminSessionReport(opts: {
  sessionId: string
  pageParam?: string
}): Promise<AdminSessionReportData> {
  const { sessionId, pageParam } = opts
  if (!UUID_RE.test(sessionId)) notFound()

  const page = parsePageParam(pageParam)
  const [summary, result] = await Promise.all([
    getAdminQuizReportSummary(sessionId),
    getAdminQuizReportQuestions({ sessionId, page }),
  ])
  if (!summary) redirect(DASHBOARD_URL)
  if (!result.ok) redirect(DASHBOARD_URL)

  const totalPages = Math.max(1, Math.ceil(result.totalCount / PAGE_SIZE))
  if (page > totalPages) redirect(`${DASHBOARD_URL}/sessions/${sessionId}?page=${totalPages}`)

  return { summary, questions: result.questions, totalCount: result.totalCount, page }
}
