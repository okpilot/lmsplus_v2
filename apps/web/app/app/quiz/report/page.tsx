import { redirect } from 'next/navigation'
import { getQuizReport } from '@/lib/queries/quiz-report'
import { ReportCard } from './_components/report-card'

export default async function QuizReportPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>
}) {
  const { session: sessionId } = await searchParams
  if (!sessionId) redirect('/app/quiz')

  const report = await getQuizReport(sessionId)
  if (!report) redirect('/app/quiz')

  return (
    <main className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Quiz Report</h1>
      <ReportCard report={report} />
    </main>
  )
}
