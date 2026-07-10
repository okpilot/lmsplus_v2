import { redirect } from 'next/navigation'
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

export async function QuizReportView({ sessionId, pageParam, namespace }: Props) {
  if (!sessionId || !UUID_RE.test(sessionId)) redirect(namespaceHome(namespace))

  const summary = await getQuizReportSummary(sessionId)
  if (!summary) redirect(namespaceHome(namespace))

  const basePath = canonicalReportBasePath(summary, namespace, pageParam)

  const page = parsePageParam(pageParam)
  const questionsResult = await getQuizReportQuestions({ sessionId, page })
  if (!questionsResult.ok) redirect(namespaceHome(namespace))

  redirectOnPageOverflow(basePath, sessionId, page, questionsResult.totalCount, PAGE_SIZE)

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
