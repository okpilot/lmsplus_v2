import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/ui/heading'
import { getFlaggedQuestionIds } from '@/lib/queries/flagged-questions'
import { getQuizReportSummary, PAGE_SIZE } from '@/lib/queries/quiz-report'
import { getQuizReportQuestions } from '@/lib/queries/quiz-report-questions'
import { parsePageParam } from '@/lib/utils/parse-page-param'
import { ReportCard } from './_components/report-card'
import { ReportFlagProvider } from './_components/report-flag-context'
import { getReportContext } from './_utils/report-context'
import {
  canonicalReportBasePath,
  namespaceHome,
  type ReportNamespace,
  redirectOnPageOverflow,
  UUID_RE,
} from './_utils/report-view-logic'

type Props = Readonly<{
  sessionId?: string
  pageParam?: string
  namespace: ReportNamespace
}>

export async function QuizReportView({ sessionId, pageParam, namespace }: Readonly<Props>) {
  if (!sessionId || !UUID_RE.test(sessionId)) redirect(namespaceHome(namespace))

  const page = parsePageParam(pageParam)
  const [summary, questionsResult] = await Promise.all([
    getQuizReportSummary(sessionId),
    getQuizReportQuestions({ sessionId, page }),
  ])
  if (!summary) redirect(namespaceHome(namespace))

  const basePath = canonicalReportBasePath(summary, namespace, pageParam)

  if (!questionsResult.ok) redirect(namespaceHome(namespace))

  redirectOnPageOverflow(basePath, sessionId, page, questionsResult.totalCount, PAGE_SIZE)

  const flaggedIds = await getFlaggedQuestionIds(questionsResult.questions.map((q) => q.questionId))
  const ctx = getReportContext(summary.mode, summary.subjectCode)

  return (
    <main className="space-y-section">
      <PageHeader title={`${ctx.noun} Results`} />
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
