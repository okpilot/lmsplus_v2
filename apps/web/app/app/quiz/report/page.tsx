import Link from 'next/link'
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
      <div className="flex items-center gap-3">
        <Link
          href="/app/quiz"
          className="md:hidden text-muted-foreground hover:text-foreground"
          aria-label="Back to quiz"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Quiz Results</h1>
      </div>
      <ReportCard report={report} />
    </main>
  )
}
