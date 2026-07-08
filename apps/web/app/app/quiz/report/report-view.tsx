import { redirect } from 'next/navigation'
import { getFlaggedQuestionIds } from '@/lib/queries/flagged-questions'
import { getQuizReportSummary, PAGE_SIZE } from '@/lib/queries/quiz-report'
import { getQuizReportQuestions } from '@/lib/queries/quiz-report-questions'
import type { QuizReportSummary } from '@/lib/queries/quiz-report-types'
import { parsePageParam } from '@/lib/utils/parse-page-param'
import { ReportCard } from './_components/report-card'
import { ReportFlagProvider } from './_components/report-flag-context'
import { getReportContext, isVfrRtPracticeReport } from './_utils/report-context'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type ReportNamespace = 'quiz' | 'vfr-rt'

type Props = Readonly<{
  sessionId?: string
  pageParam?: string
  namespace: ReportNamespace
}>

function namespaceHome(namespace: ReportNamespace): string {
  return namespace === 'vfr-rt' ? '/app/vfr-rt' : '/app/quiz'
}

// Redirect a report to its canonical namespace route so the sidebar highlights the
// right nav item — RT practice → /app/vfr-rt/report, everything else → /app/quiz/report.
// Throws (redirects) on a namespace mismatch; otherwise returns the aligned basePath so
// the page-overflow redirect can reuse it.
function canonicalReportBasePath(
  summary: QuizReportSummary,
  current: ReportNamespace,
  pageParam: string | undefined,
): string {
  const canonical: ReportNamespace = isVfrRtPracticeReport(summary.mode, summary.subjectCode)
    ? 'vfr-rt'
    : 'quiz'
  const basePath = canonical === 'vfr-rt' ? '/app/vfr-rt/report' : '/app/quiz/report'
  if (current !== canonical) {
    redirect(`${basePath}?session=${summary.sessionId}${pageParam ? `&page=${pageParam}` : ''}`)
  }
  return basePath
}

export async function QuizReportView({ sessionId, pageParam, namespace }: Props) {
  if (!sessionId || !UUID_RE.test(sessionId)) redirect(namespaceHome(namespace))

  const summary = await getQuizReportSummary(sessionId)
  if (!summary) redirect(namespaceHome(namespace))

  const basePath = canonicalReportBasePath(summary, namespace, pageParam)

  const page = parsePageParam(pageParam)
  const questionsResult = await getQuizReportQuestions({ sessionId, page })
  if (!questionsResult.ok) redirect(namespaceHome(namespace))

  // Use live answer count (not summary.totalQuestions) — partial submissions mean answered < total
  const totalPages = Math.max(1, Math.ceil(questionsResult.totalCount / PAGE_SIZE))
  if (page > totalPages) {
    redirect(`${basePath}?session=${sessionId}&page=${totalPages}`)
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
