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
