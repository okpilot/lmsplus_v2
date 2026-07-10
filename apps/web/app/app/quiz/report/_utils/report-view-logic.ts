import { redirect } from 'next/navigation'
import type { QuizReportSummary } from '@/lib/queries/quiz-report-types'
import { isVfrRtPracticeReport } from './report-context'

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type ReportNamespace = 'quiz' | 'vfr-rt'

export function namespaceHome(namespace: ReportNamespace): string {
  return namespace === 'vfr-rt' ? '/app/vfr-rt' : '/app/quiz'
}

// Redirect a report to its canonical namespace route so the sidebar highlights the
// right nav item — RT practice → /app/vfr-rt/report, everything else → /app/quiz/report.
// Throws (redirects) on a namespace mismatch; otherwise returns the aligned basePath so
// the page-overflow redirect can reuse it.
export function canonicalReportBasePath(
  summary: QuizReportSummary,
  current: ReportNamespace,
  pageParam: string | undefined,
): string {
  const canonical: ReportNamespace = isVfrRtPracticeReport(summary.mode, summary.subjectCode)
    ? 'vfr-rt'
    : 'quiz'
  const basePath = canonical === 'vfr-rt' ? '/app/vfr-rt/report' : '/app/quiz/report'
  if (current !== canonical) {
    redirect(
      `${basePath}?session=${summary.sessionId}${pageParam ? `&page=${encodeURIComponent(pageParam)}` : ''}`,
    )
  }
  return basePath
}

// Clamp an out-of-range page to the last valid page and redirect there. totalCount is the
// LIVE answered-question count (not summary.totalQuestions) — partial submissions mean
// answered < total. sessionId is UUID-validated upstream, so it is safe to interpolate raw.
// Throws (redirects) when page > totalPages; otherwise returns.
export function redirectOnPageOverflow(
  basePath: string,
  sessionId: string,
  page: number,
  totalCount: number,
  pageSize: number,
): void {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  if (page > totalPages) {
    redirect(`${basePath}?session=${sessionId}&page=${totalPages}`)
  }
}
