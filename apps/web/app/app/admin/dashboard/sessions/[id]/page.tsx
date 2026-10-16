import { PAGE_SIZE } from '@/lib/queries/quiz-report'
import { AdminReportCard } from './_components/admin-report-card'
import { AdminReportHeader } from './_components/admin-report-header'
import { loadAdminSessionReport } from './_loaders/load-admin-session-report'

type PageProps = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ page?: string }>
}

export default async function AdminSessionReportPage({
  params,
  searchParams,
}: Readonly<PageProps>) {
  const [{ id: sessionId }, { page: pageParam }] = await Promise.all([params, searchParams])
  const { summary, questions, totalCount, page } = await loadAdminSessionReport({
    sessionId,
    pageParam,
  })

  return (
    <div className="space-y-6">
      <AdminReportHeader studentId={summary.studentId} studentName={summary.studentName} />
      <AdminReportCard
        summary={summary}
        questions={questions}
        page={page}
        totalCount={totalCount}
        pageSize={PAGE_SIZE}
      />
    </div>
  )
}
