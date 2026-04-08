import { notFound, redirect } from 'next/navigation'
import {
  getAdminQuizReportQuestions,
  getAdminQuizReportSummary,
} from '@/lib/queries/admin-quiz-report'
import { PAGE_SIZE } from '@/lib/queries/quiz-report'
import { parsePageParam } from '@/lib/utils/parse-page-param'
import { AdminReportCard } from './_components/admin-report-card'
import { AdminReportHeader } from './_components/admin-report-header'

type PageProps = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ page?: string }>
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function AdminSessionReportPage({
  params,
  searchParams,
}: Readonly<PageProps>) {
  const [{ id: sessionId }, rawSearch] = await Promise.all([params, searchParams])
  if (!UUID_RE.test(sessionId)) notFound()

  const page = parsePageParam(rawSearch.page)

  const summary = await getAdminQuizReportSummary(sessionId)
  if (!summary) redirect('/app/admin/dashboard')

  const result = await getAdminQuizReportQuestions({ sessionId, page })
  if (!result.ok) redirect('/app/admin/dashboard')

  const totalPages = Math.max(1, Math.ceil(result.totalCount / PAGE_SIZE))
  if (page > totalPages) {
    redirect(`/app/admin/dashboard/sessions/${sessionId}?page=${totalPages}`)
  }

  return (
    <div className="space-y-6">
      <AdminReportHeader studentId={summary.studentId} studentName={summary.studentName} />
      <AdminReportCard
        summary={summary}
        questions={result.questions}
        page={page}
        totalCount={result.totalCount}
        pageSize={PAGE_SIZE}
      />
    </div>
  )
}
